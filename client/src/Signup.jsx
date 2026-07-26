import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import api from "./api.js";

function Signup({ onAuth }) {
  const [email, setEmail] = useState("");
  const [labName, setLabName] = useState("");
  const [role, setRole] = useState("tech");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    setLoading(true);
    try {
      const res = await api.post("/register", { email, password, lab_name: labName, role });
      onAuth(res.data.access_token, res.data.user);
      navigate("/");
    } catch (err) {
      setError(err.response?.data?.error || "Signup failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={handleSubmit}>
        <h1>LabInventory</h1>
        <p className="auth-subtitle">Create an account to get started</p>

        {error && <div className="auth-error">{error}</div>}

        <label htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
        />

        <label htmlFor="labName">Lab name</label>
        <input
          id="labName"
          type="text"
          placeholder="e.g. Chen Microbiology Lab"
          value={labName}
          onChange={(e) => setLabName(e.target.value)}
          required
        />
        <p className="field-hint">
          New name creates that lab. Existing name joins it.
        </p>

        <label htmlFor="role">Role</label>
        <select id="role" value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="tech">Lab Tech</option>
          <option value="admin">Admin</option>
        </select>
        <p className="field-hint">
          Admins can approve or reject restock requests; lab techs can submit
          them. Both can manage the lab's inventory.
        </p>

        <label htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="new-password"
          minLength={6}
        />

        <label htmlFor="confirmPassword">Confirm Password</label>
        <input
          id="confirmPassword"
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
          autoComplete="new-password"
        />

        <button type="submit" className="btn-primary" disabled={loading}>
          {loading ? "Creating account..." : "Sign Up"}
        </button>

        <p className="auth-switch">
          Already have an account? <Link to="/login">Log in</Link>
        </p>
      </form>
    </div>
  );
}

export default Signup;
