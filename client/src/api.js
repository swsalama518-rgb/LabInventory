import axios from "axios";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:5050/api";

export const ROLE_LABELS = {
  coordinator: "Lab Coordinator",
  faculty: "Faculty",
  grad_student: "Graduate Student",
  undergrad: "Undergrad",
  staff: "Staff",
};

const CHIP_COLORS = ["blue", "purple", "teal", "amber", "green", "rose"];

export function chipColor(id) {
  return CHIP_COLORS[id % CHIP_COLORS.length];
}

const api = axios.create({
  baseURL: API_BASE_URL,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      if (window.location.pathname !== "/login") {
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  }
);

export default api;
