/**
 * OTTv2 - Trình điều khiển giao diện chính (app.js)
 * Tối giản, gọn gàng, hỗ trợ:
 *  1. Chơi Hai Người (Online 1v1 qua mã phòng, Cục bộ, Luyện tập AI)
 *  2. Giải Đấu 4 Bàn gọn gàng (Tập trung 1 bàn cờ chính, chuyển bàn mượt mà)
 */

(function (window) {
  'use strict';

  class GameApp {
    constructor() {
      this.mode = 'online'; // 'online', 'tournament', 'local', 'ai'
      this.localState = null;
      this.selectedCell = null;
      this.legalMoves = [];
      this.myRole = 'spectator'; // 'red', 'blue', 'spectator', 'both'
      this.aiBot = null;
      this.boardElement = null;
      this.isAiThinking = false;
      this.activeTableId = 1; // Dùng cho giải đấu
    }

    init() {
      const urlParams = new URLSearchParams(window.location.search);
      this.mode = urlParams.get('mode') || 'online';
      this.boardElement = document.getElementById('board-grid');
      if (!this.boardElement) return;

      if (this.mode === 'ai') {
        this.aiBot = new window.PracticeBot('blue');
        this.initLocalGame();
      } else if (this.mode === 'local') {
        this.initLocalGame();
      } else if (this.mode === 'tournament') {
        this.initTournamentGame();
      } else {
        this.initOnlineGame();
      }

      this.bindGlobalEvents();
    }

    // ==========================================
    // 1. CHẾ ĐỘ CHƠI HAI NGƯỜI CỤC BỘ & ĐẤU AI
    // ==========================================
    initLocalGame() {
      const board = window.OTT.createInitialBoard('frontline');
      const pieceCounts = window.OTT.countPieces(board);

      this.localState = {
        board,
        turn: window.OTT.PLAYERS.RED,
        pieceCounts,
        winner: null,
        winReason: null,
        winDescription: '',
        history: []
      };

      this.myRole = (this.mode === 'ai') ? 'red' : 'both';
      this.renderBoard(this.localState);
      this.updateHUD(this.localState);

      const redName = 'Người chơi 1 (Đỏ)';
      const blueName = (this.mode === 'ai') ? '🤖 Máy (AI)' : 'Người chơi 2 (Xanh)';
      this.updatePlayerInfo({
        red: { name: redName, connected: true },
        blue: { name: blueName, connected: true }
      });

      this.setRoleBadge(this.mode === 'ai' ? 'Đấu Với Máy (AI)' : '2 Người Cùng Máy');
      this.setRoomCodeBadge(this.mode === 'ai' ? 'LUYỆN TẬP' : 'CỤC BỘ');
      this.setSpectatorCount('Cục bộ');
    }

    // ==========================================
    // 2. CHẾ ĐỘ CHƠI HAI NGƯỜI ONLINE (1 vs 1)
    // ==========================================
    initOnlineGame() {
      const urlParams = new URLSearchParams(window.location.search);
      const roomCode = urlParams.get('room') || Math.floor(1000 + Math.random() * 9000).toString();
      const roleParam = urlParams.get('role') || 'auto';
      const playerName = urlParams.get('name') || `Kỳ thủ ${Math.floor(Math.random() * 100)}`;

      this.setRoomCodeBadge(roomCode);

      const copyBtn = document.getElementById('btn-copy-code');
      if (copyBtn) {
        copyBtn.style.display = 'inline-flex';
        copyBtn.onclick = () => {
          window.Network.copyToClipboard(roomCode).then(() => {
            this.showToast(`Đã sao chép mã phòng: ${roomCode}`);
          });
        };
      }

      window.Network.on('joined_success', (data) => {
        this.myRole = data.role;
        this.updateRoleBadge(data.role);
        this.renderBoard(data.gameState);
        this.updateHUD(data.gameState);
        this.updatePlayerInfo(data.players);
        this.setSpectatorCount(`${data.spectatorCount} Khán giả`);
        this.renderChatMessages(data.chatHistory || []);
        this.showToast(`Đã kết nối phòng [${data.roomCode}]`);
      });

      window.Network.on('room_updated', (data) => {
        this.updatePlayerInfo(data.players);
        this.setSpectatorCount(`${data.spectatorCount} Khán giả`);
      });

      window.Network.on('move_performed', (data) => {
        if (data.capturedPiece) {
          window.soundEngine.playCapture();
        } else {
          window.soundEngine.playMove();
        }

        this.selectedCell = null;
        this.legalMoves = [];
        this.renderBoard(data.gameState);
        this.updateHUD(data.gameState);
        this.addHistoryItem(data.moveRecord);

        if (data.gameState.winner) {
          window.soundEngine.playVictory();
          this.showVictoryModal(data.gameState);
        }
      });

      window.Network.on('move_error', (data) => {
        this.showToast(data.message, 'warning');
      });

      window.Network.on('game_reset', (data) => {
        this.selectedCell = null;
        this.legalMoves = [];
        this.renderBoard(data.gameState);
        this.updateHUD(data.gameState);
        this.clearHistory();
        this.closeVictoryModal();
        this.showToast('Ván đấu mới đã bắt đầu!');
      });

      window.Network.on('new_chat_message', (data) => {
        this.appendChatMessage(data);
        if (data.role !== 'system') {
          window.soundEngine.playChat();
        }
      });

      window.Network.on('floating_reaction', (data) => {
        this.showFloatingEmoji(data.emoji);
        window.soundEngine.playReaction();
      });

      window.Network.init();
      window.Network.joinRoom({
        roomCode,
        playerName,
        role: roleParam
      });
    }

    // ==========================================
    // 3. CHẾ ĐỘ GIẢI ĐẤU 4 BÀN GỌN GÀNG
    // ==========================================
    initTournamentGame() {
      const urlParams = new URLSearchParams(window.location.search);
      const roleParam = urlParams.get('role') || 'spectator';
      const tableParam = parseInt(urlParams.get('table')) || 1;
      const colorParam = urlParams.get('color') || 'auto';
      const playerName = urlParams.get('name') || `Tuyển thủ ${Math.floor(Math.random() * 100)}`;

      this.setRoomCodeBadge('GIẢI ĐẤU (4 BÀN)');

      // Hiển thị thanh chuyển bàn thi đấu
      const tourNav = document.getElementById('tournament-tabs');
      if (tourNav) tourNav.style.display = 'flex';

      const tourSummary = document.getElementById('tournament-summary-card');
      if (tourSummary) tourSummary.style.display = 'block';

      window.Network.on('tournament_joined_success', (data) => {
        this.myRole = data.role;
        this.activeTableId = data.assignedTableId || 1;

        if (this.myRole === 'player') {
          const colorName = data.assignedColor === 'red' ? 'ĐỎ' : 'XANH';
          this.setRoleBadge(`Tuyển thủ Bàn ${this.activeTableId} (${colorName})`);
        } else {
          this.setRoleBadge('Khán Giả Xem Giải');
        }

        this.renderTournamentTabs(data.tournament.tables);
        this.renderTournamentSummary(data.tournament.tables);
        this.displayTournamentTable(this.activeTableId);
        this.setSpectatorCount(`${data.tournament.spectatorCount} Khán giả`);
        this.renderChatMessages(data.tournament.chatHistory || []);
        this.updateTournamentResetBtn(data.tournament.tables);

        this.showToast(`Chào mừng ${data.playerName} đến với Giải Đấu!`);
      });

      window.Network.on('tournament_state_updated', (data) => {
        this.renderTournamentTabs(data.tables);
        this.renderTournamentSummary(data.tables);
        this.setSpectatorCount(`${data.spectatorCount} Khán giả`);
        this.updateTournamentResetBtn(data.tables);

        const currentTable = data.tables.find(t => t.id === this.activeTableId);
        if (currentTable) {
          this.updatePlayerInfo(currentTable.players);
          this.updateHUD(currentTable.gameState);
        }
      });

      window.Network.on('tournament_move_performed', (data) => {
        if (window.Network.tournamentData && window.Network.tournamentData.tables) {
          const table = window.Network.tournamentData.tables.find(t => t.id === data.tableId);
          if (table) {
            table.gameState = data.gameState;
            this.renderTournamentTabs(window.Network.tournamentData.tables);
            this.renderTournamentSummary(window.Network.tournamentData.tables);
            this.updateTournamentResetBtn(window.Network.tournamentData.tables);
          }
        }

        // Nếu bàn cờ hiện tại đang mở bàn này thì cập nhật
        if (data.tableId === this.activeTableId) {
          if (data.capturedPiece) {
            window.soundEngine.playCapture();
          } else {
            window.soundEngine.playMove();
          }

          this.selectedCell = null;
          this.legalMoves = [];
          this.renderBoard(data.gameState);
          this.updateHUD(data.gameState);
          this.addHistoryItem(data.moveRecord);

          if (data.gameState.winner) {
            window.soundEngine.playVictory();
            this.showVictoryModal(data.gameState);
          }
        }
      });

      window.Network.on('tournament_all_reset', (data) => {
        this.renderTournamentTabs(data.tables);
        this.renderTournamentSummary(data.tables);
        this.updateTournamentResetBtn(data.tables);
        this.displayTournamentTable(this.activeTableId);
        this.closeVictoryModal();
        this.showToast('Giải đấu đã được làm mới toàn bộ!');
      });

      window.Network.on('tournament_new_chat', (data) => {
        this.appendChatMessage(data);
        if (data.role !== 'system') {
          window.soundEngine.playChat();
        }
      });

      window.Network.on('tournament_floating_reaction', (data) => {
        this.showFloatingEmoji(data.emoji);
        window.soundEngine.playReaction();
      });

      window.Network.on('move_error', (data) => {
        this.showToast(data.message, 'warning');
      });

      window.Network.init();
      window.Network.joinTournament({
        playerName,
        role: roleParam,
        tableId: tableParam,
        color: colorParam
      });
    }

    displayTournamentTable(tableId) {
      this.activeTableId = tableId;
      if (!window.Network.tournamentData || !window.Network.tournamentData.tables) return;

      const table = window.Network.tournamentData.tables.find(t => t.id === tableId);
      if (!table) return;

      this.selectedCell = null;
      this.legalMoves = [];
      this.renderBoard(table.gameState);
      this.updateHUD(table.gameState);
      this.updatePlayerInfo(table.players);

      // Cập nhật tab active
      const tabs = document.querySelectorAll('.tour-tab');
      tabs.forEach(tab => {
        const id = parseInt(tab.getAttribute('data-table'));
        tab.classList.toggle('active', id === tableId);
      });
    }

    renderTournamentTabs(tables) {
      const container = document.getElementById('tournament-tabs');
      if (!container) return;

      container.innerHTML = '';
      tables.forEach(table => {
        const tab = document.createElement('button');
        tab.className = `tour-tab ${table.id === this.activeTableId ? 'active' : ''}`;
        tab.setAttribute('data-table', table.id);

        let statusText = 'Đang mở';
        let statusClass = 'status-waiting';
        if (table.gameState.winner) {
          statusText = table.gameState.winner === 'red' ? 'Đỏ thắng' : 'Xanh thắng';
          statusClass = 'status-ended';
        } else if (table.players.red && table.players.blue) {
          statusText = 'Đang đấu';
          statusClass = 'status-live';
        }

        tab.innerHTML = `
          <div class="tab-title">${table.name}</div>
          <div class="tab-status ${statusClass}">● ${statusText}</div>
        `;

        tab.addEventListener('click', () => {
          this.displayTournamentTable(table.id);
        });

        container.appendChild(tab);
      });
    }

    renderTournamentSummary(tables) {
      const list = document.getElementById('tournament-summary-list');
      if (!list) return;

      list.innerHTML = '';
      tables.forEach(table => {
        const row = document.createElement('div');
        row.className = 'summary-row';

        const redName = table.players.red ? table.players.red.name : 'Trống';
        const blueName = table.players.blue ? table.players.blue.name : 'Trống';

        let resultBadge = '';
        if (table.gameState.winner) {
          const winColor = table.gameState.winner === 'red' ? 'red' : 'blue';
          resultBadge = `<span class="badge-tag win-${winColor}">${table.gameState.winner === 'red' ? 'ĐỎ THẮNG' : 'XANH THẮNG'}</span>`;
        } else {
          resultBadge = `<span class="badge-tag live">ĐANG ĐẤU</span>`;
        }

        row.innerHTML = `
          <span class="table-label">${table.name}</span>
          <span class="matchup-text">
            <span class="player-red-text">🔴 ${redName}</span>
            <span class="vs-text">vs</span>
            <span class="player-blue-text">🔵 ${blueName}</span>
          </span>
          ${resultBadge}
        `;

        row.addEventListener('click', () => {
          this.displayTournamentTable(table.id);
        });

        list.appendChild(row);
      });
    }

    updateTournamentResetBtn(tables) {
      const resetBtn = document.getElementById('btn-tour-reset');
      if (!resetBtn) return;

      if (this.myRole !== 'player') {
        resetBtn.style.display = 'none';
        return;
      }

      resetBtn.style.display = 'inline-flex';
      const allDone = tables.every(t => !!t.gameState.winner);
      resetBtn.disabled = !allDone;
      if (allDone) {
        resetBtn.title = 'Bấm để làm mới toàn bộ 4 bàn thi đấu';
        resetBtn.classList.remove('btn-disabled');
      } else {
        const doneCount = tables.filter(t => !!t.gameState.winner).length;
        resetBtn.title = `Cần hoàn thành cả 4 bàn (Hiện tại: ${doneCount}/4)`;
        resetBtn.classList.add('btn-disabled');
      }
    }

    // ==========================================
    // RENDER BÀN CỜ 9x9 VÀ TƯƠNG TÁC
    // ==========================================
    renderBoard(gameState) {
      if (!this.boardElement || !gameState) return;
      const { board } = gameState;
      this.boardElement.innerHTML = '';

      const isMyTurn = (this.mode === 'online') ? (gameState.turn === this.myRole) :
                       (this.mode === 'tournament') ? (
                         this.myRole === 'player' &&
                         window.Network.myTableId === this.activeTableId &&
                         gameState.turn === window.Network.myColor
                       ) : true;

      for (let r = 8; r >= 0; r--) {
        for (let c = 0; c < 9; c++) {
          const cell = document.createElement('div');
          cell.className = 'cell';
          cell.setAttribute('data-col', c);
          cell.setAttribute('data-row', r);

          // Căn cứ a1 và i9
          if (c === 0 && r === 0) {
            cell.classList.add('base-sanctuary', 'base-red');
            cell.setAttribute('title', 'Căn cứ Đỏ (Mục tiêu của Xanh)');
          } else if (c === 8 && r === 8) {
            cell.classList.add('base-sanctuary', 'base-blue');
            cell.setAttribute('title', 'Căn cứ Xanh (Mục tiêu của Đỏ)');
          }

          // Ô đang chọn
          if (this.selectedCell && this.selectedCell.col === c && this.selectedCell.row === r) {
            cell.classList.add('selected');
          }

          // Gợi ý nước đi
          const moveHint = this.legalMoves.find(m => m.col === c && m.row === r);
          if (moveHint) {
            if (moveHint.action === 'capture') {
              cell.classList.add('hint-capture');
            } else {
              cell.classList.add('hint-move');
            }
          }

          // Quân cờ
          const piece = board[r][c];
          if (piece) {
            const pieceDiv = document.createElement('div');
            pieceDiv.className = `piece piece-${piece.player}`;

            let icon = '✊';
            let label = 'Đấm';
            if (piece.type === window.OTT.PIECE_TYPES.PAPER) {
              icon = '✋';
              label = 'Lá';
            } else if (piece.type === window.OTT.PIECE_TYPES.SCISSORS) {
              icon = '✌️';
              label = 'Kéo';
            }

            pieceDiv.innerHTML = `
              <span class="piece-icon">${icon}</span>
              <span class="piece-label">${label}</span>
            `;

            cell.appendChild(pieceDiv);
          }

          // Click vào ô cờ
          cell.addEventListener('click', () => {
            this.handleCellClick(c, r, gameState);
          });

          this.boardElement.appendChild(cell);
        }
      }
    }

    handleCellClick(col, row, gameState) {
      if (gameState.winner) return;

      // Kiểm tra quyền đi
      let canMove = false;
      if (this.mode === 'online') {
        canMove = (this.myRole === 'red' || this.myRole === 'blue') && (gameState.turn === this.myRole);
      } else if (this.mode === 'tournament') {
        canMove = (this.myRole === 'player') &&
                  (window.Network.myTableId === this.activeTableId) &&
                  (gameState.turn === window.Network.myColor);
      } else if (this.mode === 'ai') {
        canMove = (this.myRole === 'red') && (gameState.turn === 'red') && !this.isAiThinking;
      } else {
        canMove = true; // Cục bộ
      }

      const clickedPiece = gameState.board[row][col];

      // Nếu click vào ô gợi ý nước đi
      const matchedMove = this.legalMoves.find(m => m.col === col && m.row === row);
      if (matchedMove && this.selectedCell) {
        this.executeMove(this.selectedCell, { col, row });
        return;
      }

      if (!canMove) return;

      // Nếu click vào quân của mình
      const currentTurn = gameState.turn;
      const myPieceColor = (this.mode === 'local') ? currentTurn :
                           (this.mode === 'ai') ? 'red' :
                           (this.mode === 'tournament') ? window.Network.myColor : this.myRole;

      if (clickedPiece && clickedPiece.player === myPieceColor && clickedPiece.player === currentTurn) {
        this.selectedCell = { col, row };
        this.legalMoves = window.OTT.getLegalMoves(gameState.board, col, row, currentTurn);
        this.renderBoard(gameState);
        return;
      }

      // Click ra ngoài -> Hủy chọn
      this.selectedCell = null;
      this.legalMoves = [];
      this.renderBoard(gameState);
    }

    executeMove(from, to) {
      if (this.mode === 'online' || this.mode === 'tournament') {
        window.Network.makeMove(from, to);
      } else {
        // Cục bộ hoặc Đấu với AI
        const result = window.OTT.makeMove(this.localState, from, to);
        if (!result.valid) {
          this.showToast(result.error, 'warning');
          return;
        }

        if (result.capturedPiece) {
          window.soundEngine.playCapture();
        } else {
          window.soundEngine.playMove();
        }

        this.localState = result.newState;
        this.selectedCell = null;
        this.legalMoves = [];
        this.renderBoard(this.localState);
        this.updateHUD(this.localState);
        this.addHistoryItem(result.moveRecord);

        if (this.localState.winner) {
          window.soundEngine.playVictory();
          this.showVictoryModal(this.localState);
          return;
        }

        // Lượt của Bot AI
        if (this.mode === 'ai' && this.localState.turn === 'blue') {
          this.isAiThinking = true;
          setTimeout(() => {
            const aiMove = this.aiBot.calculateBestMove(this.localState);
            this.isAiThinking = false;
            if (aiMove) {
              this.executeMove(aiMove.from, aiMove.to);
            }
          }, 400);
        }
      }
    }

    // ==========================================
    // CẬP NHẬT GIAO DIỆN & HUD
    // ==========================================
    updateHUD(gameState) {
      if (!gameState) return;

      const turnIndicator = document.getElementById('turn-indicator');
      if (turnIndicator) {
        const isRed = gameState.turn === 'red';
        turnIndicator.textContent = `Lượt đi: Quân ${isRed ? 'ĐỎ' : 'XANH'}`;
        turnIndicator.className = `turn-badge turn-${gameState.turn}`;
      }

      // Cập nhật số quân Đỏ
      const redCounts = gameState.pieceCounts.red;
      const elRedRock = document.getElementById('red-count-rock');
      const elRedPaper = document.getElementById('red-count-paper');
      const elRedScissors = document.getElementById('red-count-scissors');
      if (elRedRock) elRedRock.textContent = redCounts.ROCK;
      if (elRedPaper) elRedPaper.textContent = redCounts.PAPER;
      if (elRedScissors) elRedScissors.textContent = redCounts.SCISSORS;

      // Cập nhật số quân Xanh
      const blueCounts = gameState.pieceCounts.blue;
      const elBlueRock = document.getElementById('blue-count-rock');
      const elBluePaper = document.getElementById('blue-count-paper');
      const elBlueScissors = document.getElementById('blue-count-scissors');
      if (elBlueRock) elBlueRock.textContent = blueCounts.ROCK;
      if (elBluePaper) elBluePaper.textContent = blueCounts.PAPER;
      if (elBlueScissors) elBlueScissors.textContent = blueCounts.SCISSORS;
    }

    updatePlayerInfo(players) {
      const redNameEl = document.getElementById('player-red-name');
      const blueNameEl = document.getElementById('player-blue-name');

      if (redNameEl) {
        redNameEl.textContent = players.red ? players.red.name : 'Đang chờ...';
      }
      if (blueNameEl) {
        blueNameEl.textContent = players.blue ? players.blue.name : 'Đang chờ...';
      }
    }

    setRoleBadge(text) {
      const badge = document.getElementById('badge-role');
      if (badge) badge.textContent = text;
    }

    updateRoleBadge(role) {
      const text = role === 'red' ? 'Bạn là: Quân ĐỎ (Đi trước)' :
                   role === 'blue' ? 'Bạn là: Quân XANH' :
                   'Khán Giả Xem Đấu';
      this.setRoleBadge(text);
    }

    setRoomCodeBadge(code) {
      const badge = document.getElementById('room-code-display');
      if (badge) badge.textContent = code;
    }

    setSpectatorCount(text) {
      const el = document.getElementById('spectator-count');
      if (el) el.textContent = text;
    }

    addHistoryItem(record) {
      const historyList = document.getElementById('move-history-list');
      if (!historyList || !record) return;

      const item = document.createElement('div');
      item.className = 'history-item';

      const colorName = record.player === 'red' ? 'Đỏ' : 'Xanh';
      const pieceName = record.pieceType === 'ROCK' ? 'Đấm' :
                        record.pieceType === 'PAPER' ? 'Lá' : 'Kéo';
      const capText = record.capturedPiece ? ` (Ăn ${record.capturedPiece})` : '';

      item.textContent = `${colorName}: ${record.from} ➔ ${record.to} [${pieceName}]${capText}`;
      historyList.prepend(item);
    }

    clearHistory() {
      const historyList = document.getElementById('move-history-list');
      if (historyList) historyList.innerHTML = '';
    }

    appendChatMessage(data) {
      const chatList = document.getElementById('chat-messages');
      if (!chatList) return;

      const msg = document.createElement('div');
      msg.className = `chat-bubble ${data.role || ''}`;
      msg.innerHTML = `<strong>${data.sender}:</strong> ${data.text}`;
      chatList.appendChild(msg);
      chatList.scrollTop = chatList.scrollHeight;
    }

    renderChatMessages(list) {
      const chatList = document.getElementById('chat-messages');
      if (!chatList) return;
      chatList.innerHTML = '';
      list.forEach(msg => this.appendChatMessage(msg));
    }

    showFloatingEmoji(emoji) {
      const container = document.getElementById('floating-emojis-layer');
      if (!container) return;

      const span = document.createElement('span');
      span.className = 'floating-emoji';
      span.textContent = emoji;
      span.style.left = `${30 + Math.random() * 40}%`;

      container.appendChild(span);
      setTimeout(() => span.remove(), 2000);
    }

    showVictoryModal(gameState) {
      const modal = document.getElementById('victory-modal');
      const title = document.getElementById('victory-title');
      const desc = document.getElementById('victory-desc');
      if (!modal) return;

      const winnerText = gameState.winner === 'red' ? 'QUÂN ĐỎ CHIẾN THẮNG!' : 'QUÂN XANH CHIẾN THẮNG!';
      if (title) title.textContent = winnerText;
      if (desc) desc.textContent = gameState.winDescription;

      modal.style.display = 'flex';
    }

    closeVictoryModal() {
      const modal = document.getElementById('victory-modal');
      if (modal) modal.style.display = 'none';
    }

    showToast(message, type = 'info') {
      const container = document.getElementById('toast-container');
      if (!container) return;

      const toast = document.createElement('div');
      toast.className = `toast toast-${type}`;
      toast.textContent = message;

      container.appendChild(toast);
      setTimeout(() => {
        toast.classList.add('fade-out');
        setTimeout(() => toast.remove(), 300);
      }, 3000);
    }

    bindGlobalEvents() {
      // Nút luật chơi
      const btnRules = document.getElementById('btn-rules-modal');
      const modalRules = document.getElementById('rules-modal');
      const closeRules = document.getElementById('btn-close-rules');
      if (btnRules && modalRules) {
        btnRules.onclick = () => modalRules.style.display = 'flex';
      }
      if (closeRules && modalRules) {
        closeRules.onclick = () => modalRules.style.display = 'none';
      }

      // Nút âm thanh
      const btnSound = document.getElementById('btn-toggle-sound');
      if (btnSound) {
        btnSound.onclick = () => {
          const enabled = window.soundEngine.toggle();
          btnSound.textContent = enabled ? '🔊' : '🔇';
        };
      }

      // Nút ván mới (1v1 hoặc local)
      const btnReset = document.getElementById('btn-rematch');
      if (btnReset) {
        btnReset.onclick = () => {
          if (this.mode === 'online') {
            window.Network.resetGame();
          } else {
            this.initLocalGame();
            this.closeVictoryModal();
          }
        };
      }

      // Nút reset giải đấu
      const btnTourReset = document.getElementById('btn-tour-reset');
      if (btnTourReset) {
        btnTourReset.onclick = () => {
          window.Network.resetTournamentAll();
        };
      }

      // Khung chat
      const chatInput = document.getElementById('input-chat-message');
      const chatSend = document.getElementById('btn-send-chat');
      const doSendChat = () => {
        if (!chatInput) return;
        const text = chatInput.value.trim();
        if (text) {
          window.Network.sendChat(text);
          chatInput.value = '';
        }
      };

      if (chatSend) chatSend.onclick = doSendChat;
      if (chatInput) {
        chatInput.addEventListener('keypress', (e) => {
          if (e.key === 'Enter') doSendChat();
        });
      }

      // Reaction
      const reactionBtns = document.querySelectorAll('.reaction-btn');
      reactionBtns.forEach(btn => {
        btn.addEventListener('click', () => {
          const emoji = btn.getAttribute('data-emoji');
          if (emoji) window.Network.sendReaction(emoji);
        });
      });
    }
  }

  window.GameApp = new GameApp();
  window.addEventListener('DOMContentLoaded', () => {
    window.GameApp.init();
  });
})(window);
