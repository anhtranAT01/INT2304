/**
 * OTTv2 (Oẳn Tù Tì v2) - Máy Chủ Ứng Dụng (Node.js Express + Socket.IO)
 * Quản lý:
 *  1. Phòng chơi 2 người (1-vs-1) qua mã phòng
 *  2. Giải đấu chuyên nghiệp 4 bàn thi đấu gọn gàng, hỗ trợ khán giả trực tiếp
 */

const express = require('express');
const http = require('http');
const path = require('path');
const os = require('os');
const { Server } = require('socket.io');
const rules = require('./rules');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 3000;

// Cấu hình thư mục tĩnh & parser
app.use(express.static(path.join(__dirname, '../public')));
app.use(express.json());

// Lưu trữ các phòng chơi 2 người trong bộ nhớ
const rooms = new Map();

// Trạng thái giải đấu: 4 Bàn đấu, tối đa 8 tuyển thủ, không giới hạn khán giả
const tournament = {
  id: 'TOURNAMENT_2026',
  title: 'GIẢI ĐẤU OẲN TÙ TÌ 9x9 (4 BÀN THI ĐẤU)',
  tables: [
    createTournamentTable(1, 'Bàn 1 (Trận 1)'),
    createTournamentTable(2, 'Bàn 2 (Trận 2)'),
    createTournamentTable(3, 'Bàn 3 (Trận 3)'),
    createTournamentTable(4, 'Bàn 4 (Chung Kết)')
  ],
  spectators: new Map(), // socketId -> { name, joinedAt }
  chatHistory: []
};

function createTournamentTable(id, name) {
  const initialBoard = rules.createInitialBoard('frontline');
  const pieceCounts = rules.countPieces(initialBoard);
  return {
    id,
    name,
    players: {
      red: null,
      blue: null
    },
    gameState: {
      board: initialBoard,
      turn: rules.PLAYERS.RED,
      pieceCounts,
      winner: null,
      winReason: null,
      winDescription: '',
      history: []
    }
  };
}

// Lấy danh sách IP mạng nội bộ (LAN)
function getLocalIpAddresses() {
  const interfaces = os.networkInterfaces();
  const addresses = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        addresses.push(iface.address);
      }
    }
  }
  return addresses;
}

// REST APIs
app.get('/api/network-ip', (req, res) => {
  const localIps = getLocalIpAddresses();
  res.json({
    port: PORT,
    localIps,
    primaryUrl: localIps.length > 0 ? `http://${localIps[0]}:${PORT}` : `http://localhost:${PORT}`
  });
});

app.get('/api/rooms', (req, res) => {
  const roomList = [];
  for (const [code, room] of rooms.entries()) {
    roomList.push({
      code,
      title: room.title || `Phòng ${code}`,
      hasRed: !!room.players.red,
      hasBlue: !!room.players.blue,
      spectatorCount: room.spectators.size,
      status: room.gameState.winner ? 'finished' : (room.players.red && room.players.blue ? 'playing' : 'waiting'),
      turn: room.gameState.turn,
      createdAt: room.createdAt
    });
  }
  res.json({ rooms: roomList });
});

// Trạng thái giải đấu API
app.get('/api/tournament', (req, res) => {
  const tableSummaries = tournament.tables.map(t => ({
    id: t.id,
    name: t.name,
    redPlayer: t.players.red ? t.players.red.name : null,
    bluePlayer: t.players.blue ? t.players.blue.name : null,
    winner: t.gameState.winner,
    turn: t.gameState.turn,
    moveCount: t.gameState.history.length
  }));

  const allFinished = tournament.tables.every(t => !!t.gameState.winner);
  const finishedCount = tournament.tables.filter(t => !!t.gameState.winner).length;

  res.json({
    title: tournament.title,
    spectatorCount: tournament.spectators.size,
    allFinished,
    finishedCount,
    tables: tableSummaries
  });
});

// API hỗ trợ kiểm thử mô phỏng kết quả bàn đấu
app.post('/api/tournament/simulate-winner', (req, res) => {
  const { tableId, winner } = req.body;
  const table = tournament.tables.find(t => t.id === parseInt(tableId));
  if (!table) return res.status(404).json({ error: 'Table not found' });
  table.gameState.winner = winner;
  table.gameState.winReason = winner ? 'TOTAL_ELIMINATION' : null;
  table.gameState.winDescription = winner ? `Bên ${winner} đã thắng ván đấu!` : '';
  res.json({ success: true, tableId, winner });
});

// Hỗ trợ định tuyến các trang thi đấu
app.get(['/arena.html', '/play.html', '/playfull.html'], (req, res) => {
  const arenaFile = path.join(__dirname, '../public/arena.html');
  res.sendFile(arenaFile);
});

// Tạo hoặc lấy phòng chơi chuẩn
function getOrCreateRoom(code, options = {}) {
  const normalizedCode = (code || '1000').trim().toUpperCase();
  if (!rooms.has(normalizedCode)) {
    const layout = options.layout || 'frontline';
    const initialBoard = rules.createInitialBoard(layout);
    const pieceCounts = rules.countPieces(initialBoard);

    rooms.set(normalizedCode, {
      code: normalizedCode,
      title: options.title || `Phòng ${normalizedCode}`,
      layout,
      createdAt: Date.now(),
      players: {
        red: null,
        blue: null
      },
      spectators: new Map(),
      gameState: {
        board: initialBoard,
        turn: rules.PLAYERS.RED,
        pieceCounts,
        winner: null,
        winReason: null,
        winDescription: '',
        history: []
      },
      chatHistory: []
    });
  }
  return rooms.get(normalizedCode);
}

// Xử lý WebSocket Socket.IO
io.on('connection', (socket) => {
  let currentRoomCode = null;
  let currentRole = null; // 'red', 'blue', hoặc 'spectator'
  let currentName = 'Khách';
  let isTournamentMode = false;
  let tournamentTableId = null;

  // ==========================================
  // 1. CHẾ ĐỘ PHÒNG ĐẤU 2 NGƯỜI (1 vs 1)
  // ==========================================
  socket.on('join_game', ({ roomCode = '1000', playerName = 'Người chơi', role = 'auto', layout = 'frontline' }) => {
    isTournamentMode = false;
    const normalizedCode = roomCode.trim().toUpperCase();
    const room = getOrCreateRoom(normalizedCode, { layout });
    currentRoomCode = normalizedCode;
    currentName = playerName.trim() || `NgườiChơi_${socket.id.slice(0, 4)}`;

    socket.join(normalizedCode);

    let assignedRole = 'spectator';
    if (role === 'red') {
      if (!room.players.red || !room.players.red.connected) assignedRole = 'red';
    } else if (role === 'blue') {
      if (!room.players.blue || !room.players.blue.connected) assignedRole = 'blue';
    } else if (role === 'spectator') {
      assignedRole = 'spectator';
    } else {
      if (!room.players.red || !room.players.red.connected) {
        assignedRole = 'red';
      } else if (!room.players.blue || !room.players.blue.connected) {
        assignedRole = 'blue';
      } else {
        assignedRole = 'spectator';
      }
    }

    currentRole = assignedRole;

    if (assignedRole === 'red') {
      room.players.red = { id: socket.id, name: currentName, connected: true };
    } else if (assignedRole === 'blue') {
      room.players.blue = { id: socket.id, name: currentName, connected: true };
    } else {
      room.spectators.set(socket.id, { name: currentName, joinedAt: Date.now() });
    }

    const roleText = assignedRole === 'red' ? 'Quân ĐỎ (Đi trước)' :
                     assignedRole === 'blue' ? 'Quân XANH' :
                     'Khán giả theo dõi';
    
    const sysMsg = {
      id: `sys_${Date.now()}_${Math.random()}`,
      sender: 'HỆ THỐNG',
      role: 'system',
      text: `${currentName} đã vào phòng [${normalizedCode}] (${roleText})`,
      timestamp: Date.now()
    };
    room.chatHistory.push(sysMsg);
    if (room.chatHistory.length > 100) room.chatHistory.shift();

    socket.emit('joined_game_success', {
      roomCode: normalizedCode,
      role: assignedRole,
      playerName: currentName,
      gameState: room.gameState,
      players: {
        red: room.players.red ? { name: room.players.red.name, connected: room.players.red.connected } : null,
        blue: room.players.blue ? { name: room.players.blue.name, connected: room.players.blue.connected } : null
      },
      spectatorCount: room.spectators.size,
      chatHistory: room.chatHistory
    });

    io.to(normalizedCode).emit('room_state_updated', {
      players: {
        red: room.players.red ? { name: room.players.red.name, connected: room.players.red.connected } : null,
        blue: room.players.blue ? { name: room.players.blue.name, connected: room.players.blue.connected } : null
      },
      spectatorCount: room.spectators.size
    });

    io.to(normalizedCode).emit('new_chat_message', sysMsg);
  });

  // Nước đi trong phòng 1v1
  socket.on('client_move', ({ roomCode, from, to }) => {
    const normalizedCode = (roomCode || currentRoomCode || '').trim().toUpperCase();
    const room = rooms.get(normalizedCode);
    if (!room) return;

    if (currentRole !== 'red' && currentRole !== 'blue') {
      socket.emit('move_error', { message: 'Khán giả chỉ có quyền quan sát, không thể đi quân!' });
      return;
    }

    if (room.gameState.turn !== currentRole) {
      socket.emit('move_error', { message: 'Chưa đến lượt đi của bạn!' });
      return;
    }

    const result = rules.makeMove(room.gameState, from, to);
    if (!result.valid) {
      socket.emit('move_error', { message: result.error });
      return;
    }

    room.gameState = result.newState;

    io.to(normalizedCode).emit('move_performed', {
      moveRecord: result.moveRecord,
      capturedPiece: result.capturedPiece,
      gameState: room.gameState
    });

    if (room.gameState.winner) {
      const winnerName = room.gameState.winner === rules.PLAYERS.RED
        ? (room.players.red ? room.players.red.name : 'Quân ĐỎ')
        : (room.players.blue ? room.players.blue.name : 'Quân XANH');

      const vicMsg = {
        id: `sys_win_${Date.now()}`,
        sender: 'TRỌNG TÀI',
        role: 'system',
        text: `🏆 TRẬN ĐẤU KẾT THÚC: ${winnerName} CHIẾN THẮNG! (${room.gameState.winDescription})`,
        timestamp: Date.now()
      };
      room.chatHistory.push(vicMsg);
      io.to(normalizedCode).emit('new_chat_message', vicMsg);
    }
  });

  // Làm mới ván đấu 1v1
  socket.on('client_reset_game', ({ roomCode, layout = 'frontline' }) => {
    const normalizedCode = (roomCode || currentRoomCode || '').trim().toUpperCase();
    const room = rooms.get(normalizedCode);
    if (!room) return;

    if (currentRole !== 'red' && currentRole !== 'blue') {
      socket.emit('move_error', { message: 'Chỉ người chơi trong phòng mới có thể bắt đầu ván mới!' });
      return;
    }

    const initialBoard = rules.createInitialBoard(layout);
    room.gameState = {
      board: initialBoard,
      turn: rules.PLAYERS.RED,
      pieceCounts: rules.countPieces(initialBoard),
      winner: null,
      winReason: null,
      winDescription: '',
      history: []
    };

    io.to(normalizedCode).emit('game_reset', {
      gameState: room.gameState,
      resetBy: currentName
    });
  });

  // Chat trong phòng 1v1
  socket.on('client_send_chat', ({ roomCode, text }) => {
    const normalizedCode = (roomCode || currentRoomCode || '').trim().toUpperCase();
    const room = rooms.get(normalizedCode);
    if (!room || !text || !text.trim()) return;

    const chatMsg = {
      id: `chat_${Date.now()}_${Math.random()}`,
      sender: currentName,
      role: currentRole,
      text: text.trim().slice(0, 200),
      timestamp: Date.now()
    };
    room.chatHistory.push(chatMsg);
    if (room.chatHistory.length > 100) room.chatHistory.shift();

    io.to(normalizedCode).emit('new_chat_message', chatMsg);
  });

  // Thả biểu cảm trong phòng 1v1
  socket.on('client_send_reaction', ({ roomCode, emoji }) => {
    const normalizedCode = (roomCode || currentRoomCode || '').trim().toUpperCase();
    io.to(normalizedCode).emit('floating_reaction', {
      emoji,
      sender: currentName,
      role: currentRole,
      id: Math.random().toString(36).substring(2, 9)
    });
  });

  // ========================================================
  // 2. CHẾ ĐỘ GIẢI ĐẤU (4 BÀN - 8 TUYỂN THỦ - KHÁN GIẢ)
  // ========================================================
  socket.on('join_tournament', ({ playerName = 'Tuyển thủ', role = 'spectator', tableId = 1, color = 'auto' }) => {
    isTournamentMode = true;
    currentName = playerName.trim() || `KhánGiả_${socket.id.slice(0, 4)}`;
    socket.join('ROOM_TOURNAMENT');

    let assignedRole = 'spectator';
    let assignedTableId = parseInt(tableId) || 1;
    let assignedColor = null;

    if (role === 'player') {
      const table = tournament.tables.find(t => t.id === assignedTableId);
      if (table) {
        if (color === 'red' && (!table.players.red || !table.players.red.connected)) {
          assignedColor = 'red';
          assignedRole = 'player';
          table.players.red = { id: socket.id, name: currentName, connected: true };
        } else if (color === 'blue' && (!table.players.blue || !table.players.blue.connected)) {
          assignedColor = 'blue';
          assignedRole = 'player';
          table.players.blue = { id: socket.id, name: currentName, connected: true };
        } else if (color === 'auto') {
          if (!table.players.red || !table.players.red.connected) {
            assignedColor = 'red';
            assignedRole = 'player';
            table.players.red = { id: socket.id, name: currentName, connected: true };
          } else if (!table.players.blue || !table.players.blue.connected) {
            assignedColor = 'blue';
            assignedRole = 'player';
            table.players.blue = { id: socket.id, name: currentName, connected: true };
          } else {
            assignedRole = 'spectator';
          }
        }
      }
    }

    if (assignedRole === 'spectator') {
      tournament.spectators.set(socket.id, { name: currentName, joinedAt: Date.now() });
    }

    currentRole = assignedRole;
    tournamentTableId = (assignedRole === 'player') ? assignedTableId : null;

    const roleNotice = assignedRole === 'player'
      ? `Tuyển thủ ${assignedColor === 'red' ? 'ĐỎ' : 'XANH'} tại Bàn ${assignedTableId}`
      : 'Khán giả xem giải đấu';

    const tourSysMsg = {
      id: `tour_sys_${Date.now()}`,
      sender: 'BAN TỔ CHỨC',
      role: 'system',
      text: `${currentName} đã tham gia: ${roleNotice}`,
      timestamp: Date.now()
    };
    tournament.chatHistory.push(tourSysMsg);
    if (tournament.chatHistory.length > 100) tournament.chatHistory.shift();

    socket.emit('tournament_joined_success', {
      role: assignedRole,
      assignedColor,
      assignedTableId,
      playerName: currentName,
      tournament: {
        title: tournament.title,
        tables: tournament.tables.map(t => ({
          id: t.id,
          name: t.name,
          players: {
            red: t.players.red ? { name: t.players.red.name, connected: t.players.red.connected } : null,
            blue: t.players.blue ? { name: t.players.blue.name, connected: t.players.blue.connected } : null
          },
          gameState: t.gameState
        })),
        spectatorCount: tournament.spectators.size,
        chatHistory: tournament.chatHistory
      }
    });

    io.to('ROOM_TOURNAMENT').emit('tournament_state_updated', {
      tables: tournament.tables.map(t => ({
        id: t.id,
        name: t.name,
        players: {
          red: t.players.red ? { name: t.players.red.name, connected: t.players.red.connected } : null,
          blue: t.players.blue ? { name: t.players.blue.name, connected: t.players.blue.connected } : null
        },
        gameState: t.gameState
      })),
      spectatorCount: tournament.spectators.size
    });

    io.to('ROOM_TOURNAMENT').emit('tournament_new_chat', tourSysMsg);
  });

  // Nước đi của tuyển thủ trong giải đấu
  socket.on('tournament_client_move', ({ tableId, from, to }) => {
    if (currentRole !== 'player') {
      socket.emit('move_error', { message: 'Khán giả chỉ có quyền xem, không được tham gia đi quân!' });
      return;
    }

    const table = tournament.tables.find(t => t.id === parseInt(tableId));
    if (!table) return;

    if (tournamentTableId !== table.id) {
      socket.emit('move_error', { message: `Bạn là tuyển thủ Bàn ${tournamentTableId}, không được đi quân tại Bàn ${table.id}!` });
      return;
    }

    const activePlayer = table.gameState.turn;
    const isRedTurn = activePlayer === rules.PLAYERS.RED;
    const isTurn = (isRedTurn && table.players.red && table.players.red.id === socket.id) ||
                   (!isRedTurn && table.players.blue && table.players.blue.id === socket.id);

    if (!isTurn) {
      socket.emit('move_error', { message: 'Chưa đến lượt của bạn tại bàn này!' });
      return;
    }

    const result = rules.makeMove(table.gameState, from, to);
    if (!result.valid) {
      socket.emit('move_error', { message: result.error });
      return;
    }

    table.gameState = result.newState;

    io.to('ROOM_TOURNAMENT').emit('tournament_move_performed', {
      tableId: table.id,
      moveRecord: result.moveRecord,
      capturedPiece: result.capturedPiece,
      gameState: table.gameState
    });

    if (table.gameState.winner) {
      const winnerName = table.gameState.winner === rules.PLAYERS.RED
        ? (table.players.red ? table.players.red.name : 'Quân ĐỎ')
        : (table.players.blue ? table.players.blue.name : 'Quân XANH');

      const vicMsg = {
        id: `tour_win_${Date.now()}`,
        sender: `TRỌNG TÀI BÀN ${table.id}`,
        role: 'system',
        text: `🏆 [Bàn ${table.id}] ${winnerName} CHIẾN THẮNG! (${table.gameState.winDescription})`,
        timestamp: Date.now()
      };
      tournament.chatHistory.push(vicMsg);
      io.to('ROOM_TOURNAMENT').emit('tournament_new_chat', vicMsg);

      const allDone = tournament.tables.every(t => !!t.gameState.winner);
      if (allDone) {
        const grandFinishMsg = {
          id: `tour_all_done_${Date.now()}`,
          sender: 'BAN TỔ CHỨC',
          role: 'system',
          text: `🎉 CẢ 4 BÀN THI ĐẤU ĐÃ HOÀN TẤT! Bây giờ các tuyển thủ có thể làm mới giải đấu.`,
          timestamp: Date.now()
        };
        tournament.chatHistory.push(grandFinishMsg);
        io.to('ROOM_TOURNAMENT').emit('tournament_new_chat', grandFinishMsg);
      }
    }
  });

  // Reset giải đấu khi cả 4 bàn hoàn tất
  socket.on('tournament_reset_all', () => {
    if (currentRole !== 'player') {
      socket.emit('move_error', { message: 'Khán giả chỉ có quyền xem giải đấu, không có quyền reset!' });
      return;
    }

    const unfinishedTables = tournament.tables.filter(t => !t.gameState.winner);
    if (unfinishedTables.length > 0) {
      const finishedCount = tournament.tables.length - unfinishedTables.length;
      socket.emit('move_error', {
        message: `Chưa thể reset giải! Phải thi đấu xong cả 4 bàn mới được reset (Hiện tại mới có ${finishedCount}/4 bàn kết thúc).`
      });
      return;
    }

    tournament.tables.forEach(t => {
      const initialBoard = rules.createInitialBoard('frontline');
      t.gameState = {
        board: initialBoard,
        turn: rules.PLAYERS.RED,
        pieceCounts: rules.countPieces(initialBoard),
        winner: null,
        winReason: null,
        winDescription: '',
        history: []
      };
    });

    const resetMsg = {
      id: `tour_reset_${Date.now()}`,
      sender: 'BAN TỔ CHỨC',
      role: 'system',
      text: `🔄 Toàn bộ 4 bàn thi đấu đã được reset bởi ${currentName}. Sẵn sàng cho lượt đấu mới!`,
      timestamp: Date.now()
    };
    tournament.chatHistory.push(resetMsg);

    io.to('ROOM_TOURNAMENT').emit('tournament_all_reset', {
      tables: tournament.tables.map(t => ({
        id: t.id,
        name: t.name,
        players: {
          red: t.players.red ? { name: t.players.red.name, connected: t.players.red.connected } : null,
          blue: t.players.blue ? { name: t.players.blue.name, connected: t.players.blue.connected } : null
        },
        gameState: t.gameState
      }))
    });

    io.to('ROOM_TOURNAMENT').emit('tournament_new_chat', resetMsg);
  });

  // Chat giải đấu
  socket.on('tournament_send_chat', ({ text, tableId = 1 }) => {
    if (!text || !text.trim()) return;
    const chatMsg = {
      id: `tour_chat_${Date.now()}_${Math.random()}`,
      sender: currentName,
      role: currentRole,
      tableId,
      text: text.trim().slice(0, 200),
      timestamp: Date.now()
    };
    tournament.chatHistory.push(chatMsg);
    if (tournament.chatHistory.length > 100) tournament.chatHistory.shift();

    io.to('ROOM_TOURNAMENT').emit('tournament_new_chat', chatMsg);
  });

  // Reaction giải đấu
  socket.on('tournament_send_reaction', ({ emoji, tableId = 1 }) => {
    io.to('ROOM_TOURNAMENT').emit('tournament_floating_reaction', {
      emoji,
      sender: currentName,
      role: currentRole,
      tableId,
      id: Math.random().toString(36).substring(2, 9)
    });
  });

  // Xử lý ngắt kết nối
  socket.on('disconnect', () => {
    if (isTournamentMode) {
      tournament.spectators.delete(socket.id);
      let updated = false;

      for (const table of tournament.tables) {
        if (table.players.red && table.players.red.id === socket.id) {
          table.players.red.connected = false;
          updated = true;
        }
        if (table.players.blue && table.players.blue.id === socket.id) {
          table.players.blue.connected = false;
          updated = true;
        }
      }

      if (updated) {
        io.to('ROOM_TOURNAMENT').emit('tournament_state_updated', {
          tables: tournament.tables.map(t => ({
            id: t.id,
            name: t.name,
            players: {
              red: t.players.red ? { name: t.players.red.name, connected: t.players.red.connected } : null,
              blue: t.players.blue ? { name: t.players.blue.name, connected: t.players.blue.connected } : null
            },
            gameState: t.gameState
          })),
          spectatorCount: tournament.spectators.size
        });
      }
    } else if (currentRoomCode) {
      const room = rooms.get(currentRoomCode);
      if (room) {
        room.spectators.delete(socket.id);
        if (room.players.red && room.players.red.id === socket.id) {
          room.players.red.connected = false;
        }
        if (room.players.blue && room.players.blue.id === socket.id) {
          room.players.blue.connected = false;
        }

        io.to(currentRoomCode).emit('room_state_updated', {
          players: {
            red: room.players.red ? { name: room.players.red.name, connected: room.players.red.connected } : null,
            blue: room.players.blue ? { name: room.players.blue.name, connected: room.players.blue.connected } : null
          },
          spectatorCount: room.spectators.size
        });
      }
    }
  });
});

if (require.main === module) {
  server.listen(PORT, () => {
    const localIps = getLocalIpAddresses();
    console.log('========================================================');
    console.log(`🚀 OTTv2 MULTIPLAYER SERVER ĐANG CHẠY TẠI CỔNG ${PORT}`);
    console.log(`🌐 Truy cập cục bộ: http://localhost:${PORT}`);
    if (localIps.length > 0) {
      console.log(`📱 Truy cập trong mạng Wi-Fi / LAN:`);
      localIps.forEach(ip => {
        console.log(`   👉 http://${ip}:${PORT}`);
      });
    }
    console.log('👥 Hỗ trợ: Chơi 2 người & Giải đấu 4 bàn gọn gàng!');
    console.log('========================================================');
  });
}

module.exports = { app, server, io, tournament, rooms };
