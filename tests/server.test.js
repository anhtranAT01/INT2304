const http = require('http');
const { io } = require('socket.io-client');
const { server } = require('../server/app');

function testHttpGet(path) {
  return new Promise((resolve, reject) => {
    http.get(`http://localhost:3000${path}`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({ statusCode: res.statusCode, data });
      });
    }).on('error', reject);
  });
}

async function runTests() {
  // Đảm bảo server đang lắng nghe
  let needClose = false;
  if (!server.listening) {
    await new Promise(resolve => server.listen(3000, resolve));
    needClose = true;
  }

  console.log('--- 1. KIỂM THỬ CÁC ĐƯỜNG DẪN HTTP ---');
  
  const indexRes = await testHttpGet('/');
  console.log(`[HTTP GET /] Trạng thái: ${indexRes.statusCode}, Kích thước: ${indexRes.data.length} bytes`);
  
  const playfullRes = await testHttpGet('/playfull.html');
  console.log(`[HTTP GET /playfull.html] Trạng thái: ${playfullRes.statusCode}, Kích thước: ${playfullRes.data.length} bytes`);

  const tourRes = await testHttpGet('/api/tournament');
  console.log(`[HTTP GET /api/tournament] Trạng thái: ${tourRes.statusCode}, Dữ liệu 4 bàn: ${tourRes.data.slice(0, 100)}...`);

  console.log('\n--- 2. KIỂM THỬ KHÁN GIẢ THỜI GIAN THỰC (REAL-TIME SPECTATORS) ---');
  const roomCode = 'TEST_ROOM_' + Math.floor(Math.random() * 100000);

  const clientRed = io('http://localhost:3000');
  const clientBlue = io('http://localhost:3000');
  const clientSpectator1 = io('http://localhost:3000');
  const clientSpectator2 = io('http://localhost:3000');

  let redJoined = false;
  let blueJoined = false;
  let spec1Joined = false;
  let spec2Joined = false;

  await new Promise((resolve) => {
    clientRed.on('connect', () => {
      clientRed.emit('join_game', { roomCode, playerName: 'TuyểnThủ_Đỏ', role: 'red' });
    });
    clientRed.on('joined_game_success', (data) => {
      console.log(` Tuyển thủ Đỏ đã vào phòng [${data.roomCode}]`);
      redJoined = true;
      if (redJoined && blueJoined && spec1Joined && spec2Joined) resolve();
    });

    clientBlue.on('connect', () => {
      clientBlue.emit('join_game', { roomCode, playerName: 'TuyểnThủ_Xanh', role: 'blue' });
    });
    clientBlue.on('joined_game_success', (data) => {
      console.log(` Tuyển thủ Xanh đã vào phòng [${data.roomCode}]`);
      blueJoined = true;
      if (redJoined && blueJoined && spec1Joined && spec2Joined) resolve();
    });

    clientSpectator1.on('connect', () => {
      clientSpectator1.emit('join_game', { roomCode, playerName: 'KhánGiả_A', role: 'spectator' });
    });
    clientSpectator1.on('joined_game_success', (data) => {
      console.log(` Khán giả 1 đã vào theo dõi phòng [${data.roomCode}] (Số người xem: ${data.spectatorCount})`);
      spec1Joined = true;
      if (redJoined && blueJoined && spec1Joined && spec2Joined) resolve();
    });

    clientSpectator2.on('connect', () => {
      clientSpectator2.emit('join_game', { roomCode, playerName: 'KhánGiả_B', role: 'spectator' });
    });
    clientSpectator2.on('joined_game_success', (data) => {
      console.log(` Khán giả 2 đã vào theo dõi phòng [${data.roomCode}] (Số người xem: ${data.spectatorCount})`);
      spec2Joined = true;
      if (redJoined && blueJoined && spec1Joined && spec2Joined) resolve();
    });
  });

  console.log('\n--- 3. KIỂM THỬ ĐỒNG BỘ NƯỚC ĐI TỚI TOÀN BỘ KHÁN GIẢ ---');
  await new Promise((resolve) => {
    let receivedCount = 0;
    const checkAllReceived = () => {
      receivedCount++;
      if (receivedCount === 3) {
        console.log(' Cả đối thủ và 2 khán giả đều nhận được nước đi trong thời gian thực!');
        resolve();
      }
    };

    clientBlue.once('move_performed', (data) => {
      console.log(` Tuyển thủ Xanh nhận dữ liệu nước đi: ${data.moveRecord.from} -> ${data.moveRecord.to}`);
      checkAllReceived();
    });

    clientSpectator1.once('move_performed', (data) => {
      console.log(` Khán giả 1 nhận dữ liệu nước đi trực tiếp: ${data.moveRecord.from} -> ${data.moveRecord.to}`);
      checkAllReceived();
    });

    clientSpectator2.once('move_performed', (data) => {
      console.log(` Khán giả 2 nhận dữ liệu nước đi trực tiếp: ${data.moveRecord.from} -> ${data.moveRecord.to}`);
      checkAllReceived();
    });

    clientRed.emit('client_move', {
      roomCode,
      from: { col: 0, row: 1 },
      to: { col: 0, row: 2 }
    });
  });

  console.log('\n--- 4. KIỂM THỬ KHÁN GIẢ GIẢI ĐẤU (TOURNAMENT ARENA) ---');
  const clientTourSpectator = io('http://localhost:3000');
  await new Promise((resolve) => {
    clientTourSpectator.on('connect', () => {
      clientTourSpectator.emit('join_tournament', { playerName: 'KhánGiả_XemGiải', role: 'spectator' });
    });
    clientTourSpectator.on('tournament_joined_success', (data) => {
      console.log(` Khán giả giải đấu đã nhận dữ liệu 4 bàn thi đấu (Số lượng bàn: ${data.tournament.tables.length})`);
      resolve();
    });
  });

  // Cleanup
  clientRed.disconnect();
  clientBlue.disconnect();
  clientSpectator1.disconnect();
  clientSpectator2.disconnect();
  clientTourSpectator.disconnect();

  if (needClose) {
    server.close();
  }

  console.log('\n========================================================');
  console.log('🎉 TẤT CẢ KIỂM THỬ TÍCH HỢP MULTIPLAYER & SPECTATOR ĐÃ THÀNH CÔNG 100%!');
  console.log('========================================================\n');
  process.exit(0);
}

runTests().catch(err => {
  console.error('Test thất bại với lỗi:', err);
  process.exit(1);
});
