import { useState, useEffect, useCallback } from "react";
import "./TicTacToe.css";
import { Link } from "react-router-dom";
// ── WIN CONDITIONS ──
const WINNING_LINES = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8], // rows
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8], // cols
  [0, 4, 8],
  [2, 4, 6], // diagonals
];

function checkWinner(board) {
  for (const [a, b, c] of WINNING_LINES) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return { winner: board[a], line: [a, b, c] };
    }
  }
  if (board.every(Boolean)) return { winner: "draw", line: [] };
  return null;
}

// ── MINIMAX ──
function minimax(board, isMaximizing, depth, alpha, beta) {
  const result = checkWinner(board);
  if (result) {
    if (result.winner === "O") return 10 - depth;
    if (result.winner === "X") return depth - 10;
    return 0;
  }
  if (isMaximizing) {
    let best = -Infinity;
    for (let i = 0; i < 9; i++) {
      if (!board[i]) {
        board[i] = "O";
        best = Math.max(best, minimax(board, false, depth + 1, alpha, beta));
        board[i] = null;
        alpha = Math.max(alpha, best);
        if (beta <= alpha) break;
      }
    }
    return best;
  } else {
    let best = Infinity;
    for (let i = 0; i < 9; i++) {
      if (!board[i]) {
        board[i] = "X";
        best = Math.min(best, minimax(board, true, depth + 1, alpha, beta));
        board[i] = null;
        beta = Math.min(beta, best);
        if (beta <= alpha) break;
      }
    }
    return best;
  }
}

function getBestMove(board, difficulty) {
  const empty = board
    .map((v, i) => (v === null ? i : null))
    .filter((v) => v !== null);

  // Easy: mostly random
  if (difficulty === "easy") {
    if (Math.random() < 0.8)
      return empty[Math.floor(Math.random() * empty.length)];
  }
  // Medium: 50% optimal
  if (difficulty === "medium") {
    if (Math.random() < 0.5)
      return empty[Math.floor(Math.random() * empty.length)];
  }

  // Hard / fallthrough: full minimax
  let bestVal = -Infinity,
    bestMove = empty[0];
  for (const i of empty) {
    board[i] = "O";
    const val = minimax(board, false, 0, -Infinity, Infinity);
    board[i] = null;
    if (val > bestVal) {
      bestVal = val;
      bestMove = i;
    }
  }
  return bestMove;
}

// ── COMPONENT ──
export default function TicTacToe() {
  const [board, setBoard] = useState(Array(9).fill(null));
  const [isPlayerTurn, setIsPlayerTurn] = useState(true);
  const [result, setResult] = useState(null); // {winner, line}
  const [scores, setScores] = useState({ you: 0, draws: 0, ai: 0 });
  const [difficulty, setDifficulty] = useState("hard");
  const [thinking, setThinking] = useState(false);
  const [showOverlay, setShowOverlay] = useState(false);

  // AI move
  const makeAIMove = useCallback(
    (currentBoard) => {
      setThinking(true);
      setTimeout(() => {
        const copy = [...currentBoard];
        const move = getBestMove(copy, difficulty);
        if (move === undefined) return;
        copy[move] = "O";
        const res = checkWinner(copy);
        setBoard(copy);
        setThinking(false);
        if (res) {
          setResult(res);
          setScores((s) => ({
            ...s,
            ai: res.winner === "O" ? s.ai + 1 : s.ai,
            draws: res.winner === "draw" ? s.draws + 1 : s.draws,
          }));
          setTimeout(() => setShowOverlay(true), 300);
        } else {
          setIsPlayerTurn(true);
        }
      }, 420); // small delay so it feels like thinking
    },
    [difficulty],
  );

  useEffect(() => {
    if (!isPlayerTurn && !result) {
      makeAIMove(board);
    }
  }, [isPlayerTurn, board, result, makeAIMove]);

  const handleClick = (idx) => {
    if (!isPlayerTurn || board[idx] || result || thinking) return;
    const copy = [...board];
    copy[idx] = "X";
    const res = checkWinner(copy);
    setBoard(copy);
    if (res) {
      setResult(res);
      setScores((s) => ({
        ...s,
        you: res.winner === "X" ? s.you + 1 : s.you,
        draws: res.winner === "draw" ? s.draws + 1 : s.draws,
      }));
      setTimeout(() => setShowOverlay(true), 300);
    } else {
      setIsPlayerTurn(false);
    }
  };

  const resetGame = () => {
    setBoard(Array(9).fill(null));
    setResult(null);
    setShowOverlay(false);
    setIsPlayerTurn(true);
    setThinking(false);
  };

  const resetAll = () => {
    resetGame();
    setScores({ you: 0, draws: 0, ai: 0 });
  };

  // Status text
  let statusText = "",
    statusClass = "";
  if (result) {
    if (result.winner === "X") {
      statusText = "You win!";
      statusClass = "win";
    } else if (result.winner === "O") {
      statusText = "AI wins!";
      statusClass = "lose";
    } else {
      statusText = "It's a draw!";
      statusClass = "draw";
    }
  } else if (thinking) {
    statusText = "AI is thinking...";
    statusClass = "ai-turn";
  } else if (isPlayerTurn) {
    statusText = "Your turn — play X";
    statusClass = "your-turn";
  }

  // Overlay content
  let overlayEmoji = "",
    overlayMsg = "";
  if (result) {
    if (result.winner === "X") {
      overlayEmoji = "🏆";
      overlayMsg = "You beat the AI!";
    } else if (result.winner === "O") {
      overlayEmoji = "🤖";
      overlayMsg = "AI wins this round.";
    } else {
      overlayEmoji = "🤝";
      overlayMsg = "It's a draw!";
    }
  }

  const winLine = result?.line || [];

  return (
    <div className="ttt-wrapper">
      <div className="ttt-header">
        <Link
          to="/"
          className="btn-ttt btn-outline-ttt"
          style={{ textDecoration: "none", marginBottom: "1rem" }}
        >
          ← Back to Portfolio
        </Link>
        <h1 className="ttt-title">
          Tic<span>.</span>Tac<span>.</span>Toe
        </h1>
        <p className="ttt-subtitle">You vs. AI &nbsp;·&nbsp; Play X</p>
      </div>

      {/* SCORE */}
      <div className="score-bar">
        <div
          className={`score-item you ${isPlayerTurn && !result ? "active" : ""}`}
        >
          <div className="score-who">You (X)</div>
          <div className="score-num">{scores.you}</div>
        </div>
        <div className="score-item draws">
          <div className="score-who">Draws</div>
          <div className="score-num">{scores.draws}</div>
        </div>
        <div
          className={`score-item ai ${!isPlayerTurn && !result ? "active" : ""}`}
        >
          <div className="score-who">AI (O)</div>
          <div className="score-num">{scores.ai}</div>
        </div>
      </div>

      {/* DIFFICULTY */}
      <div className="difficulty-row">
        {["easy", "medium", "hard"].map((d) => (
          <button
            key={d}
            className={`diff-btn ${difficulty === d ? "active" : ""}`}
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
      <div className={`status-bar ${statusClass}`}>{statusText}</div>

      {/* BOARD */}
      <div className="board-container">
        <div className="board">
          {board.map((val, idx) => (
            <div
              key={idx}
              className={[
                "cell",
                val ? "filled" : "",
                !isPlayerTurn || result || thinking ? "disabled" : "",
                winLine.includes(idx) ? "winning-cell" : "",
              ].join(" ")}
              onClick={() => handleClick(idx)}
            >
              {val === "X" && <span className="cell-x">✕</span>}
              {val === "O" && <span className="cell-o">○</span>}
            </div>
          ))}
        </div>

        {/* RESULT OVERLAY */}
        {showOverlay && (
          <div className="result-overlay">
            <div className="result-emoji">{overlayEmoji}</div>
            <div className="result-text">{overlayMsg}</div>
            <button className="btn-ttt btn-primary-ttt" onClick={resetGame}>
              Play Again
            </button>
          </div>
        )}
      </div>

      {/* CONTROLS */}
      <div className="controls">
        <button className="btn-ttt btn-outline-ttt" onClick={resetGame}>
          New Game
        </button>
        <button className="btn-ttt btn-outline-ttt" onClick={resetAll}>
          Reset Scores
        </button>
      </div>
    </div>
  );
}
