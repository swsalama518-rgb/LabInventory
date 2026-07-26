import { useState } from "react";
import { Routes, Route, Navigate, Outlet } from "react-router-dom";
import Login from "./Login.jsx";
import Signup from "./Signup.jsx";
import Dashboard from "./Dashboard.jsx";
import Inventory from "./Inventory.jsx";
import Categories from "./Categories.jsx";
import Requests from "./Requests.jsx";
import Nav from "./Nav.jsx";
import "./App.css";

function App() {
  const [token, setToken] = useState(localStorage.getItem("token"));
  const [user, setUser] = useState(() => {
    const stored = localStorage.getItem("user");
    return stored ? JSON.parse(stored) : null;
  });

  function handleAuth(newToken, newUser) {
    localStorage.setItem("token", newToken);
    localStorage.setItem("user", JSON.stringify(newUser));
    setToken(newToken);
    setUser(newUser);
  }

  function handleLogout() {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setToken(null);
    setUser(null);
  }

  function ProtectedLayout() {
    if (!token) return <Navigate to="/login" replace />;
    return (
      <div className="app-shell">
        <Nav user={user} onLogout={handleLogout} />
        <main className="page-content">
          <Outlet />
        </main>
      </div>
    );
  }

  return (
    <Routes>
      <Route
        path="/login"
        element={token ? <Navigate to="/" replace /> : <Login onAuth={handleAuth} />}
      />
      <Route
        path="/signup"
        element={token ? <Navigate to="/" replace /> : <Signup onAuth={handleAuth} />}
      />
      <Route element={<ProtectedLayout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/inventory" element={<Inventory />} />
        <Route path="/categories" element={<Categories />} />
        <Route path="/requests" element={<Requests user={user} />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
