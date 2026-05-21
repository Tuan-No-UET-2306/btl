import { Navigate, Route, Routes } from "react-router-dom";

import AppLayout from "./layouts/AppLayout";
import Blacklist from "./pages/Blacklist";
import UsersManagement from "./pages/UsersManagement";
import TrafficLookup from "./pages/TrafficLookup";
import ComplaintHistory from "./pages/ComplaintHistory";
import AdminOperations from "./pages/AdminOperations";
import Dashboard from "./pages/Dashboard";
import History from "./pages/History";
import LicensePlateRecognition from "./pages/LicensePlateRecognition";
import VideoRecognition from "./pages/VideoRecognition";
import WebcamRecognition from "./pages/WebcamRecognition";
import Login from "./pages/Login";
import Register from "./pages/Register";
import { getToken } from "./utils/auth";

const ProtectedRoute = ({ children }) => {
  if (!getToken()) {
    return <Navigate to="/" replace />;
  }
  return children;
};

const ProtectedLayout = () => (
  <ProtectedRoute>
    <AppLayout />
  </ProtectedRoute>
);

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route element={<ProtectedLayout />}>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/traffic" element={<TrafficLookup />} />
        <Route path="/complaints" element={<ComplaintHistory />} />
        <Route path="/history" element={<History />} />
        <Route path="/lpr" element={<LicensePlateRecognition />} />
        <Route path="/video" element={<VideoRecognition />} />
        <Route path="/blacklist" element={<Blacklist />} />
        <Route path="/webcam" element={<WebcamRecognition />} />
        <Route path="/admin" element={<AdminOperations />} />
        <Route path="/users" element={<UsersManagement />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
