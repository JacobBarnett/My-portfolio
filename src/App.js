import { BrowserRouter, Routes, Route } from "react-router-dom";
import Portfolio from "./Portfolio";
import TicTacToe from "./TicTacToe";
import ConnectFour from "./ConnectFour";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/connectfour" element={<ConnectFour />} />
        <Route path="/" element={<Portfolio />} />
        <Route path="/tictactoe" element={<TicTacToe />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
