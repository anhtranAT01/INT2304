/**
 * OTTv2 - Practice AI Bot (bot.js)
 * Trí tuệ nhân tạo hỗ trợ luyện tập chơi đơn
 */

(function (window) {
  'use strict';

  class PracticeBot {
    constructor(color = 'blue') {
      this.color = color;
      this.opponent = color === 'blue' ? 'red' : 'blue';
      // Mục tiêu căn cứ: Xanh nhắm vào a1 (0,0), Đỏ nhắm vào i9 (8,8)
      this.targetBase = color === 'blue' ? { col: 0, row: 0 } : { col: 8, row: 8 };
    }

    calculateBestMove(gameState) {
      const { board } = gameState;
      const allMoves = [];

      for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
          const piece = board[r][c];
          if (piece && piece.player === this.color) {
            const legal = window.OTT.getLegalMoves(board, c, r, this.color);
            legal.forEach(m => {
              allMoves.push({
                from: { col: c, row: r },
                to: { col: m.col, row: m.row },
                action: m.action,
                capturedPiece: m.capturedPiece
              });
            });
          }
        }
      }

      if (allMoves.length === 0) return null;

      // Đánh giá điểm từng nước đi
      let bestMove = allMoves[0];
      let bestScore = -Infinity;

      for (const move of allMoves) {
        let score = 0;

        // 1. Thắng ngay nếu chiếm được căn cứ
        if (move.to.col === this.targetBase.col && move.to.row === this.targetBase.row) {
          score += 10000;
        }

        // 2. Điểm ăn quân
        if (move.action === 'capture') {
          score += 200;
        }

        // 3. Tiến dần về căn cứ đối phương
        const currDist = Math.abs(move.from.col - this.targetBase.col) + Math.abs(move.from.row - this.targetBase.row);
        const newDist = Math.abs(move.to.col - this.targetBase.col) + Math.abs(move.to.row - this.targetBase.row);
        score += (currDist - newDist) * 15;

        // Thêm yếu tố ngẫu nhiên nhỏ để các trận đấu phong phú
        score += Math.random() * 5;

        if (score > bestScore) {
          bestScore = score;
          bestMove = move;
        }
      }

      return bestMove;
    }
  }

  window.PracticeBot = PracticeBot;
  window.AIBot = PracticeBot; // Tương thích ngược
})(window);
