/**
 * OTTv2 (Oẳn Tù Tì v2) - Game Rules Engine
 * Bàn cờ 9x9: Cột a-i (0-8), Hàng 1-9 (0-8)
 * 
 * Quy tắc:
 * - 3 loại quân: ROCK (Đấm ✊), PAPER (Lá ✋), SCISSORS (Kéo ✌️)
 * - Mỗi bên có 9 quân (3 Đấm, 3 Lá, 3 Kéo)
 * - Di chuyển: 1 ô theo 8 hướng (ngang, dọc, chéo)
 * - Ăn quân: Đấm ăn Kéo, Kéo ăn Lá, Lá ăn Đấm.
 *   Hai quân cùng loại không thể ăn nhau, chỉ đứng chặn đường nhau.
 * - Điều kiện thắng:
 *   1. Đột kích căn cứ: Đỏ đưa quân vào i9, hoặc Xanh đưa quân vào a1.
 *   2. Ăn sạch toàn bộ quân trên bàn cờ của đối phương.
 */

const PIECE_TYPES = {
  ROCK: 'ROCK',
  PAPER: 'PAPER',
  SCISSORS: 'SCISSORS'
};

const PLAYERS = {
  RED: 'red',
  BLUE: 'blue'
};

const COLS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'];
const ROWS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

function posToCoord(col, row) {
  return `${COLS[col]}${ROWS[row]}`;
}

function coordToPos(coord) {
  if (!coord || coord.length < 2) return null;
  const colChar = coord[0].toLowerCase();
  const rowChar = coord.slice(1);
  const col = COLS.indexOf(colChar);
  const row = ROWS.indexOf(rowChar);
  if (col === -1 || row === -1) return null;
  return { col, row };
}

function canBeat(attackerType, defenderType) {
  if (attackerType === PIECE_TYPES.ROCK && defenderType === PIECE_TYPES.SCISSORS) return true;
  if (attackerType === PIECE_TYPES.SCISSORS && defenderType === PIECE_TYPES.PAPER) return true;
  if (attackerType === PIECE_TYPES.PAPER && defenderType === PIECE_TYPES.ROCK) return true;
  return false;
}

function isSameType(typeA, typeB) {
  return typeA === typeB;
}

function createInitialBoard(layout = 'frontline') {
  const board = Array(9).fill(null).map(() => Array(9).fill(null));

  const standardSequence = [
    PIECE_TYPES.ROCK,     // a
    PIECE_TYPES.PAPER,    // b
    PIECE_TYPES.SCISSORS, // c
    PIECE_TYPES.ROCK,     // d
    PIECE_TYPES.PAPER,    // e
    PIECE_TYPES.SCISSORS, // f
    PIECE_TYPES.ROCK,     // g
    PIECE_TYPES.PAPER,    // h
    PIECE_TYPES.SCISSORS  // i
  ];

  if (layout === 'frontline') {
    // Red ở Hàng 2 (row index 1)
    for (let c = 0; c < 9; c++) {
      board[1][c] = {
        id: `red_${standardSequence[c]}_${c}`,
        type: standardSequence[c],
        player: PLAYERS.RED
      };
    }
    // Blue ở Hàng 8 (row index 7)
    for (let c = 0; c < 9; c++) {
      board[7][c] = {
        id: `blue_${standardSequence[c]}_${c}`,
        type: standardSequence[c],
        player: PLAYERS.BLUE
      };
    }
  } else {
    // Baseline: Hàng 1 (row index 0) & Hàng 9 (row index 8)
    for (let c = 0; c < 9; c++) {
      board[0][c] = {
        id: `red_${standardSequence[c]}_${c}`,
        type: standardSequence[c],
        player: PLAYERS.RED
      };
      board[8][c] = {
        id: `blue_${standardSequence[c]}_${c}`,
        type: standardSequence[c],
        player: PLAYERS.BLUE
      };
    }
  }

  return board;
}

function countPieces(board) {
  const counts = {
    red: { [PIECE_TYPES.ROCK]: 0, [PIECE_TYPES.PAPER]: 0, [PIECE_TYPES.SCISSORS]: 0, total: 0 },
    blue: { [PIECE_TYPES.ROCK]: 0, [PIECE_TYPES.PAPER]: 0, [PIECE_TYPES.SCISSORS]: 0, total: 0 }
  };

  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const piece = board[r][c];
      if (piece) {
        counts[piece.player][piece.type]++;
        counts[piece.player].total++;
      }
    }
  }
  return counts;
}

function getLegalMoves(board, col, row, currentPlayer) {
  const moves = [];
  const piece = board[row][col];
  if (!piece || piece.player !== currentPlayer) return moves;

  const directions = [
    [-1, -1], [-1, 0], [-1, 1],
    [0, -1],          [0, 1],
    [1, -1],  [1, 0],  [1, 1]
  ];

  for (const [dr, dc] of directions) {
    const nr = row + dr;
    const nc = col + dc;

    if (nr < 0 || nr >= 9 || nc < 0 || nc >= 9) continue;

    const targetCell = board[nr][nc];
    if (!targetCell) {
      moves.push({ col: nc, row: nr, action: 'move' });
    } else if (targetCell.player !== piece.player) {
      if (canBeat(piece.type, targetCell.type)) {
        moves.push({ col: nc, row: nr, action: 'capture', capturedPiece: targetCell });
      }
    }
  }

  return moves;
}

function checkWinConditions(board, movedPiece, to) {
  // 1. Kiểm tra chiếm cứ điểm căn cứ
  // Đỏ thắng nếu đưa quân vào i9 (col 8, row 8)
  if (movedPiece.player === PLAYERS.RED && to.col === 8 && to.row === 8) {
    return {
      winner: PLAYERS.RED,
      reason: 'SANCTUARY',
      description: 'Quân ĐỎ đã đột kích thành công vào căn cứ i9 của đối phương! CHIẾN THẮNG!'
    };
  }

  // Xanh thắng nếu đưa quân vào a1 (col 0, row 0)
  if (movedPiece.player === PLAYERS.BLUE && to.col === 0 && to.row === 0) {
    return {
      winner: PLAYERS.BLUE,
      reason: 'SANCTUARY',
      description: 'Quân XANH đã đột kích thành công vào căn cứ a1 của đối phương! CHIẾN THẮNG!'
    };
  }

  // 2. Kiểm tra ăn sạch toàn bộ quân cờ của đối thủ
  const pieceCounts = countPieces(board);
  const opponent = movedPiece.player === PLAYERS.RED ? PLAYERS.BLUE : PLAYERS.RED;
  const oppTotal = pieceCounts[opponent].total;

  if (oppTotal === 0) {
    return {
      winner: movedPiece.player,
      reason: 'TOTAL_ELIMINATION',
      description: `Bên ${movedPiece.player === PLAYERS.RED ? 'ĐỎ' : 'XANH'} đã ăn sạch toàn bộ quân trên bàn cờ của đối thủ! CHIẾN THẮNG TUYỆT ĐỐI!`
    };
  }

  return { winner: null, reason: null, description: '' };
}

function makeMove(gameState, from, to) {
  const { board, turn } = gameState;

  if (from.col < 0 || from.col >= 9 || from.row < 0 || from.row >= 9 ||
      to.col < 0 || to.col >= 9 || to.row < 0 || to.row >= 9) {
    return { valid: false, error: 'Tọa độ ngoài phạm vi bàn cờ 9x9' };
  }

  const piece = board[from.row][from.col];
  if (!piece) {
    return { valid: false, error: 'Không có quân cờ tại vị trí xuất phát' };
  }

  if (piece.player !== turn) {
    return { valid: false, error: `Chưa đến lượt của bên ${piece.player === PLAYERS.RED ? 'ĐỎ' : 'XANH'}` };
  }

  const dCol = Math.abs(to.col - from.col);
  const dRow = Math.abs(to.row - from.row);
  if (dCol > 1 || dRow > 1 || (dCol === 0 && dRow === 0)) {
    return { valid: false, error: 'Mỗi nước đi chỉ được di chuyển đúng 1 ô theo 8 hướng' };
  }

  const targetCell = board[to.row][to.col];
  let capturedPiece = null;

  if (targetCell) {
    if (targetCell.player === piece.player) {
      return { valid: false, error: 'Không thể di chuyển vào ô có quân cùng phe' };
    }
    if (isSameType(piece.type, targetCell.type)) {
      return { valid: false, error: 'Hai quân cùng loại không thể ăn nhau, chỉ đứng chặn đường nhau!' };
    }
    if (!canBeat(piece.type, targetCell.type)) {
      return { valid: false, error: `${piece.type} không thể tấn công ${targetCell.type}!` };
    }
    capturedPiece = targetCell;
  }

  // Clone board
  const newBoard = board.map(row => row.slice());
  newBoard[from.row][from.col] = null;
  newBoard[to.row][to.col] = { ...piece };

  const winCheck = checkWinConditions(newBoard, piece, to);
  const nextTurn = winCheck.winner ? turn : (turn === PLAYERS.RED ? PLAYERS.BLUE : PLAYERS.RED);
  const newPieceCounts = countPieces(newBoard);

  const moveRecord = {
    player: piece.player,
    pieceType: piece.type,
    from: posToCoord(from.col, from.row),
    to: posToCoord(to.col, to.row),
    capturedPiece: capturedPiece ? capturedPiece.type : null,
    timestamp: Date.now()
  };

  const newHistory = [...(gameState.history || []), moveRecord];

  return {
    valid: true,
    capturedPiece,
    moveRecord,
    newState: {
      board: newBoard,
      turn: nextTurn,
      pieceCounts: newPieceCounts,
      winner: winCheck.winner,
      winReason: winCheck.reason,
      winDescription: winCheck.description,
      history: newHistory
    }
  };
}

module.exports = {
  PIECE_TYPES,
  PLAYERS,
  COLS,
  ROWS,
  posToCoord,
  coordToPos,
  canBeat,
  isSameType,
  createInitialBoard,
  countPieces,
  getLegalMoves,
  checkWinConditions,
  makeMove
};
