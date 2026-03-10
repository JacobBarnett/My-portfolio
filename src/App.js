import { BrowserRouter, Routes, Route } from "react-router-dom";
import Portfolio from "./Portfolio";
import TicTacToe from "./TicTacToe";
import ConnectFour from "./ConnectFour";
import TeslaUI from "./TeslaUI";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/connectfour" element={<ConnectFour />} />
        <Route path="/" element={<Portfolio />} />
        <Route path="/tictactoe" element={<TicTacToe />} />
        <Route path="/tesla" element={<TeslaUI />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
