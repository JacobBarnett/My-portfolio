import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import "./ConnectFour.css";

const ROWS = 6;
const COLS = 7;
const EMPTY = null;

// ── HELPERS ──
function createBoard() {
  return Array(ROWS)
    .fill(null)
    .map(() => Array(COLS).fill(EMPTY));
}

function dropPiece(board, col, piece) {
  const newBoard = board.map((r) => [...r]);
  for (let row = ROWS - 1; row >= 0; row--) {
    if (newBoard[row][col] === EMPTY) {
      newBoard[row][col] = piece;
      return { board: newBoard, row };
    }
  }
  return null; // column full
}

function isValidCol(board, col) {
  return board[0][col] === EMPTY;
}

function getValidCols(board) {
  return Array.from({ length: COLS }, (_, c) => c).filter((c) =>
    isValidCol(board, c),
  );
}

function checkWinner(board) {
  // horizontal
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c <= COLS - 4; c++) {
      const piece = board[r][c];
      if (
        piece &&
        piece === board[r][c + 1] &&
        piece === board[r][c + 2] &&
        piece === board[r][c + 3]
      ) {
        return {
          winner: piece,
          cells: [
            [r, c],
            [r, c + 1],
            [r, c + 2],
            [r, c + 3],
          ],
        };
      }
    }
  }
  // vertical
  for (let r = 0; r <= ROWS - 4; r++) {
    for (let c = 0; c < COLS; c++) {
      const piece = board[r][c];
      if (
        piece &&
        piece === board[r + 1][c] &&
        piece === board[r + 2][c] &&
        piece === board[r + 3][c]
      ) {
        return {
          winner: piece,
          cells: [
            [r, c],
            [r + 1, c],
            [r + 2, c],
            [r + 3, c],
          ],
        };
      }
    }
  }
  // diagonal down-right
  for (let r = 0; r <= ROWS - 4; r++) {
    for (let c = 0; c <= COLS - 4; c++) {
      const piece = board[r][c];
      if (
        piece &&
        piece === board[r + 1][c + 1] &&
        piece === board[r + 2][c + 2] &&
        piece === board[r + 3][c + 3]
      ) {
        return {
          winner: piece,
          cells: [
            [r, c],
            [r + 1, c + 1],
            [r + 2, c + 2],
            [r + 3, c + 3],
          ],
        };
      }
    }
  }
  // diagonal down-left
  for (let r = 0; r <= ROWS - 4; r++) {
    for (let c = 3; c < COLS; c++) {
      const piece = board[r][c];
      if (
        piece &&
        piece === board[r + 1][c - 1] &&
        piece === board[r + 2][c - 2] &&
        piece === board[r + 3][c - 3]
      ) {
        return {
          winner: piece,
          cells: [
            [r, c],
            [r + 1, c - 1],
            [r + 2, c - 2],
            [r + 3, c - 3],
          ],
        };
      }
    }
  }
  // draw
  if (board[0].every((cell) => cell !== EMPTY))
    return { winner: "draw", cells: [] };
  return null;
}

// ── SCORING FOR MINIMAX ──
function scoreWindow(window, piece) {
  const opp = piece === "AI" ? "P" : "AI";
  const pieceCount = window.filter((c) => c === piece).length;
  const emptyCount = window.filter((c) => c === EMPTY).length;
  const oppCount = window.filter((c) => c === opp).length;
  if (pieceCount === 4) return 100;
  if (pieceCount === 3 && emptyCount === 1) return 5;
  if (pieceCount === 2 && emptyCount === 2) return 2;
  if (oppCount === 3 && emptyCount === 1) return -4;
  return 0;
}

function scoreBoard(board, piece) {
  let score = 0;
  // centre column preference
  const centre = board.map((r) => r[Math.floor(COLS / 2)]);
  score += centre.filter((c) => c === piece).length * 3;

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c <= COLS - 4; c++)
      score += scoreWindow(
        [board[r][c], board[r][c + 1], board[r][c + 2], board[r][c + 3]],
        piece,
      );
  }
  for (let c = 0; c < COLS; c++) {
    for (let r = 0; r <= ROWS - 4; r++)
      score += scoreWindow(
        [board[r][c], board[r + 1][c], board[r + 2][c], board[r + 3][c]],
        piece,
      );
  }
  for (let r = 0; r <= ROWS - 4; r++) {
    for (let c = 0; c <= COLS - 4; c++)
      score += scoreWindow(
        [
          board[r][c],
          board[r + 1][c + 1],
          board[r + 2][c + 2],
          board[r + 3][c + 3],
        ],
        piece,
      );
  }
  for (let r = 0; r <= ROWS - 4; r++) {
    for (let c = 3; c < COLS; c++)
      score += scoreWindow(
        [
          board[r][c],
          board[r + 1][c - 1],
          board[r + 2][c - 2],
          board[r + 3][c - 3],
        ],
        piece,
      );
  }
  return score;
}

function minimax(board, depth, alpha, beta, maximizing) {
  const result = checkWinner(board);
  if (result) {
    if (result.winner === "AI") return { score: 100000 + depth };
    if (result.winner === "P") return { score: -100000 - depth };
    return { score: 0 };
  }
  if (depth === 0) return { score: scoreBoard(board, "AI") };

  const valid = getValidCols(board);
  if (maximizing) {
    let best = { score: -Infinity, col: valid[0] };
    for (const col of valid) {
      const result = dropPiece(board, col, "AI");
      if (!result) continue;
      const child = minimax(result.board, depth - 1, alpha, beta, false);
      if (child.score > best.score) {
        best = { score: child.score, col };
      }
      alpha = Math.max(alpha, best.score);
      if (alpha >= beta) break;
    }
    return best;
  } else {
    let best = { score: Infinity, col: valid[0] };
    for (const col of valid) {
      const result = dropPiece(board, col, "P");
      if (!result) continue;
      const child = minimax(result.board, depth - 1, alpha, beta, true);
      if (child.score < best.score) {
        best = { score: child.score, col };
      }
      beta = Math.min(beta, best.score);
      if (alpha >= beta) break;
    }
    return best;
  }
}

function getAIMove(board, difficulty) {
  const valid = getValidCols(board);
  if (difficulty === "easy") {
    if (Math.random() < 0.75)
      return valid[Math.floor(Math.random() * valid.length)];
    return minimax(board, 2, -Infinity, Infinity, true).col;
  }
  if (difficulty === "medium") {
    if (Math.random() < 0.35)
      return valid[Math.floor(Math.random() * valid.length)];
    return minimax(board, 3, -Infinity, Infinity, true).col;
  }
  // hard
  return minimax(board, 5, -Infinity, Infinity, true).col;
}

// ── COMPONENT ──
export default function ConnectFour() {
  const [board, setBoard] = useState(createBoard());
  const [isPlayerTurn, setIsPlayerTurn] = useState(true);
  const [result, setResult] = useState(null);
  const [scores, setScores] = useState({ you: 0, draws: 0, ai: 0 });
  const [difficulty, setDifficulty] = useState("hard");
  const [thinking, setThinking] = useState(false);
  const [showOverlay, setShowOverlay] = useState(false);
  const [hoverCol, setHoverCol] = useState(null);

  const handleResult = useCallback((res, scores) => {
    setResult(res);
    if (res.winner === "P") setScores((s) => ({ ...s, you: s.you + 1 }));
    if (res.winner === "AI") setScores((s) => ({ ...s, ai: s.ai + 1 }));
    if (res.winner === "draw") setScores((s) => ({ ...s, draws: s.draws + 1 }));
    setTimeout(() => setShowOverlay(true), 400);
  }, []);

  // AI move
  useEffect(() => {
    if (!isPlayerTurn && !result) {
      setThinking(true);
      const timer = setTimeout(() => {
        setBoard((prev) => {
          const col = getAIMove(prev, difficulty);
          const dropped = dropPiece(prev, col, "AI");
          if (!dropped) return prev;
          const res = checkWinner(dropped.board);
          if (res) handleResult(res);
          else setIsPlayerTurn(true);
          setThinking(false);
          return dropped.board;
        });
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [isPlayerTurn, result, difficulty, handleResult]);

  const handleColClick = (col) => {
    if (!isPlayerTurn || result || thinking || !isValidCol(board, col)) return;
    const dropped = dropPiece(board, col, "P");
    if (!dropped) return;
    setBoard(dropped.board);
    const res = checkWinner(dropped.board);
    if (res) handleResult(res);
    else setIsPlayerTurn(false);
  };

  const resetGame = () => {
    setBoard(createBoard());
    setResult(null);
    setShowOverlay(false);
    setIsPlayerTurn(true);
    setThinking(false);
    setHoverCol(null);
  };

  const resetAll = () => {
    resetGame();
    setScores({ you: 0, draws: 0, ai: 0 });
  };

  // build a set of winning cell keys for quick lookup
  const winCells = new Set(result?.cells?.map(([r, c]) => `${r}-${c}`) || []);

  // status
  let statusText = "",
    statusClass = "";
  if (result) {
    if (result.winner === "P") {
      statusText = "You win! 🔴";
      statusClass = "you-win";
    } else if (result.winner === "AI") {
      statusText = "AI wins! 🟡";
      statusClass = "ai-win";
    } else {
      statusText = "It's a draw!";
      statusClass = "draw";
    }
  } else if (thinking) {
    statusText = "AI is thinking...";
    statusClass = "ai-turn";
  } else {
    statusText = "Your turn — drop red";
    statusClass = "your-turn";
  }

  const canInteract = isPlayerTurn && !result && !thinking;

  return (
    <div className="c4-wrapper">
      <Link to="/" className="c4-back">
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M19 12H5M12 5l-7 7 7 7" />
        </svg>
        Portfolio
      </Link>

      {/* HEADER */}
      <div className="c4-header">
        <h1 className="c4-title">
          <span className="red">Connect</span>
          <span className="sep">/</span>
          <span className="yell">Four</span>
        </h1>
        <p className="c4-subtitle">You (Red) vs. AI (Yellow)</p>
      </div>

      {/* SCORE */}
      <div className="c4-score-bar">
        <div
          className={`c4-score-item you ${isPlayerTurn && !result ? "active" : ""}`}
        >
          <div className="c4-score-who">You 🔴</div>
          <div className="c4-score-num">{scores.you}</div>
        </div>
        <div className="c4-score-item draw">
          <div className="c4-score-who">Draws</div>
          <div className="c4-score-num">{scores.draws}</div>
        </div>
        <div
          className={`c4-score-item ai ${!isPlayerTurn && !result ? "active" : ""}`}
        >
          <div className="c4-score-who">AI 🟡</div>
          <div className="c4-score-num">{scores.ai}</div>
        </div>
      </div>

      {/* DIFFICULTY */}
      <div className="c4-diff-row">
        {["easy", "medium", "hard"].map((d) => (
          <button
            key={d}
            className={`c4-diff-btn ${difficulty === d ? "active" : ""}`}
            onClick={() => {
              setDifficulty(d);
              resetGame();
            }}
          >
            {d}
          </button>
        ))}
      </div>

      {/* STATUS */}
      <div className={`c4-status ${statusClass}`}>{statusText}</div>

      {/* COLUMN ARROWS */}
      <div className="col-arrows">
        {Array.from({ length: COLS }, (_, col) => (
          <div
            key={col}
            className={`col-arrow ${!canInteract ? "disabled" : ""}`}
            onClick={() => handleColClick(col)}
            onMouseEnter={() => canInteract && setHoverCol(col)}
            onMouseLeave={() => setHoverCol(null)}
          >
            ▼
          </div>
        ))}
      </div>

      {/* BOARD */}
      <div className="c4-board-wrap">
        <div className="c4-board">
          {board.map((row, r) =>
            row.map((cell, c) => {
              const isWin = winCells.has(`${r}-${c}`);
              const isHover =
                canInteract &&
                hoverCol === c &&
                cell === EMPTY &&
                isValidCol(board, c);
              // find bottom-most empty row for this column for hover preview
              let bottomEmpty = -1;
              for (let rr = ROWS - 1; rr >= 0; rr--) {
                if (board[rr][c] === EMPTY) {
                  bottomEmpty = rr;
                  break;
                }
              }
              const showPreview = isHover && r === bottomEmpty;

              return (
                <div
                  key={`${r}-${c}`}
                  className={[
                    "c4-cell",
                    cell === "P" ? "player" : "",
                    cell === "AI" ? "ai-piece" : "",
                    isWin ? "winning" : "",
                    showPreview ? "preview-player" : "",
                  ].join(" ")}
                  onClick={() => handleColClick(c)}
                  onMouseEnter={() => canInteract && setHoverCol(c)}
                  onMouseLeave={() => setHoverCol(null)}
                />
              );
            }),
          )}
        </div>

        {/* OVERLAY */}
        {showOverlay && (
          <div className="c4-overlay">
            <div className="c4-overlay-emoji">
              {result?.winner === "P"
                ? "🏆"
                : result?.winner === "AI"
                  ? "🤖"
                  : "🤝"}
            </div>
            <div className="c4-overlay-text">
              {result?.winner === "P"
                ? "You beat the AI!"
                : result?.winner === "AI"
                  ? "AI wins this round."
                  : "It's a draw!"}
            </div>
            <button className="c4-btn c4-btn-primary" onClick={resetGame}>
              Play Again
            </button>
          </div>
        )}
      </div>

      {/* CONTROLS */}
      <div className="c4-controls">
        <button className="c4-btn c4-btn-ghost" onClick={resetGame}>
          New Game
        </button>
        <button className="c4-btn c4-btn-ghost" onClick={resetAll}>
          Reset Scores
        </button>
      </div>
    </div>
  );
}
