import { BrowserRouter, Routes, Route } from "react-router-dom";
import Portfolio from "./Portfolio";
import TicTacToe from "./TicTacToe";
import ConnectFour from "./ConnectFour";
import TeslaUI from "./TeslaUI";
import RoboTaxi from "./RoboTaxi";
import AMD from "./AMD";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Portfolio />} />
        <Route path="/tictactoe" element={<TicTacToe />} />
        <Route path="/connectfour" element={<ConnectFour />} />
        <Route path="/tesla" element={<TeslaUI />} />
        <Route path="/callback" element={<TeslaUI />} />
        <Route path="/robotaxi" element={<RoboTaxi />} />
        <Route path="/asteroids" element={<AMD />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
