const rules = require('../server/rules');

console.log('--- KIỂM THỬ BỘ LUẬT OTTv2 9x9 ---');

// Test 1: Đỏ đến i9 (Chiếm căn cứ đối phương)
let state = {
  board: rules.createInitialBoard('frontline'),
  turn: rules.PLAYERS.RED,
  pieceCounts: null,
  history: []
};
state.pieceCounts = rules.countPieces(state.board);

state.board[7][7] = { id: 'red_h8', type: rules.PIECE_TYPES.ROCK, player: rules.PLAYERS.RED };
const resGoal = rules.makeMove(state, { col: 7, row: 7 }, { col: 8, row: 8 });
console.log('1. Đột kích căn cứ i9:');
console.log('  Hợp lệ:', resGoal.valid);
console.log('  Người thắng:', resGoal.newState.winner);
console.log('  Lý do:', resGoal.newState.winReason);
if (resGoal.newState.winner !== 'red' || resGoal.newState.winReason !== 'SANCTUARY') {
  throw new Error('Test đột kích căn cứ i9 thất bại!');
}

// Test 2: Bị ăn 1 loại quân không làm ván đấu kết thúc nếu đối thủ vẫn còn quân khác
let state2 = {
  board: Array(9).fill(null).map(() => Array(9).fill(null)),
  turn: rules.PLAYERS.RED,
  pieceCounts: null,
  history: []
};
state2.board[3][3] = { id: 'red_p', type: rules.PIECE_TYPES.PAPER, player: rules.PLAYERS.RED };
state2.board[3][4] = { id: 'blue_r', type: rules.PIECE_TYPES.ROCK, player: rules.PLAYERS.BLUE };
state2.board[8][0] = { id: 'blue_s1', type: rules.PIECE_TYPES.SCISSORS, player: rules.PLAYERS.BLUE };
state2.board[8][1] = { id: 'blue_s2', type: rules.PIECE_TYPES.SCISSORS, player: rules.PLAYERS.BLUE };
state2.pieceCounts = rules.countPieces(state2.board);

console.log('\n2. Tuyệt diệt 1 loại quân (Ván đấu vẫn tiếp tục):');
console.log('  Tổng quân Xanh trước nước đi:', state2.pieceCounts.blue.total);
const resNonEnd = rules.makeMove(state2, { col: 3, row: 3 }, { col: 4, row: 3 });
console.log('  Hợp lệ:', resNonEnd.valid);
console.log('  Quân bị ăn:', resNonEnd.capturedPiece ? resNonEnd.capturedPiece.type : 'none');
console.log('  Người thắng (phải là null):', resNonEnd.newState.winner);
if (resNonEnd.newState.winner !== null) {
  throw new Error('Ván đấu kết thúc quá sớm khi đối thủ vẫn còn quân khác!');
}

// Test 3: Ăn sạch toàn bộ quân của đối thủ -> Chiến thắng tuyệt đối
let state3 = {
  board: Array(9).fill(null).map(() => Array(9).fill(null)),
  turn: rules.PLAYERS.RED,
  pieceCounts: null,
  history: []
};
state3.board[4][4] = { id: 'red_p', type: rules.PIECE_TYPES.PAPER, player: rules.PLAYERS.RED };
state3.board[4][5] = { id: 'blue_last_r', type: rules.PIECE_TYPES.ROCK, player: rules.PLAYERS.BLUE };
state3.pieceCounts = rules.countPieces(state3.board);

console.log('\n3. Tuyệt diệt toàn bộ quân đối phương:');
const resTotalElim = rules.makeMove(state3, { col: 4, row: 4 }, { col: 5, row: 4 });
console.log('  Hợp lệ:', resTotalElim.valid);
console.log('  Người thắng:', resTotalElim.newState.winner);
console.log('  Lý do:', resTotalElim.newState.winReason);
if (resTotalElim.newState.winner !== 'red' || resTotalElim.newState.winReason !== 'TOTAL_ELIMINATION') {
  throw new Error('Test ăn sạch quân đối phương thất bại!');
}

// Test 4: Hai quân cùng loại không thể ăn nhau
let state4 = {
  board: Array(9).fill(null).map(() => Array(9).fill(null)),
  turn: rules.PLAYERS.RED,
  pieceCounts: null,
  history: []
};
state4.board[2][2] = { id: 'red_r', type: rules.PIECE_TYPES.ROCK, player: rules.PLAYERS.RED };
state4.board[2][3] = { id: 'blue_r', type: rules.PIECE_TYPES.ROCK, player: rules.PLAYERS.BLUE };
state4.pieceCounts = rules.countPieces(state4.board);

console.log('\n4. Hai quân cùng loại chặn đường nhau:');
const resBlock = rules.makeMove(state4, { col: 2, row: 2 }, { col: 3, row: 2 });
console.log('  Hợp lệ (phải là false):', resBlock.valid);
console.log('  Lỗi:', resBlock.error);
if (resBlock.valid !== false) {
  throw new Error('Hai quân cùng loại không được phép ăn nhau!');
}

console.log('\n✅ 100% CÁC BÀI KIỂM THỬ LUẬT CHƠI ĐỀU THÀNH CÔNG!');
