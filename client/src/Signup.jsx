import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import api from "./api.js";
import Icon from "./Icon.jsx";

const ROLE_OPTIONS = [
  { value: "faculty", label: "Faculty" },
  { value: "grad_student", label: "Graduate Student" },
  { value: "undergrad", label: "Undergrad" },
  { value: "staff", label: "Staff" },
];

function Signup({ onAuth }) {
  const [email, setEmail] = useState("");
  const [labName, setLabName] = useState("");
  const [role, setRole] = useState("staff");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [pendingMessage, setPendingMessage] = useState("");
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
      if (res.data.pending) {
        setPendingMessage(res.data.message);
        return;
      }
      onAuth(res.data.access_token, res.data.user);
      navigate("/");
    } catch (err) {
      setError(err.response?.data?.error || "Signup failed");
    } finally {
      setLoading(false);
    }
  }

  if (pendingMessage) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <h1 className="auth-brand"><Icon name="flask" />Lab Manager</h1>
          <p className="auth-subtitle">{pendingMessage}</p>
          <p className="auth-switch">
            <Link to="/login">Back to login</Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={handleSubmit}>
        <h1 className="auth-brand"><Icon name="flask" />Lab Manager</h1>
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
          New name creates that lab and makes you its Lab Coordinator.
          Existing name sends a join request to that lab's coordinator —
          you'll be able to log in once approved.
        </p>

        <label htmlFor="role">Your role</label>
        <select id="role" value={role} onChange={(e) => setRole(e.target.value)}>
          {ROLE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <p className="field-hint">
          Only used if you're joining an existing lab (ignored if you're
          creating a new one — you'll be its Lab Coordinator instead).
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
