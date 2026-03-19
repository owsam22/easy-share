import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Home from './components/Home';
import SharePage from './components/SharePage';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/s/:roomId" element={<SharePage />} />
      </Routes>
    </Router>
  );
}

export default App;
