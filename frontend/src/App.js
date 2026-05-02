import React from "react";
import "./App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "sonner";

import { AuthProvider } from "./lib/auth";
import { ProtectedRoute } from "./components/common/ProtectedRoute";

// Public
import Home from "./pages/public/Home";
import Projects from "./pages/public/Projects";
import ProjectDetail from "./pages/public/ProjectDetail";
import PropertyDetail from "./pages/public/PropertyDetail";
import Contact from "./pages/public/Contact";

// Auth
import StaffLogin from "./pages/auth/StaffLogin";
import ClientLogin from "./pages/auth/ClientLogin";
import ForgotPassword from "./pages/auth/ForgotPassword";
import ResetPassword from "./pages/auth/ResetPassword";
import ChangePassword from "./pages/auth/ChangePassword";

// Client
import ClientDashboard, { ClientLayout } from "./pages/client/ClientDashboard";
import ClientReservations from "./pages/client/ClientReservations";
import ClientPayments from "./pages/client/ClientPayments";
import ClientDocuments from "./pages/client/ClientDocuments";
import ClientUpdates from "./pages/client/ClientUpdates";
import ClientProfile from "./pages/client/ClientProfile";
import ClientMessages from "./pages/client/ClientMessages";

// Admin
import AdminDashboard, { AdminLayout } from "./pages/admin/AdminDashboard";
import AdminProjects from "./pages/admin/AdminProjects";
import AdminProperties from "./pages/admin/AdminProperties";
import AdminReservations from "./pages/admin/AdminReservations";
import AdminClients from "./pages/admin/AdminClients";
import AdminInquiries from "./pages/admin/AdminInquiries";
import AdminAudit from "./pages/admin/AdminAudit";
import AdminFloorPlans from "./pages/admin/AdminFloorPlans";
import AdminImportDocs from "./pages/admin/AdminImportDocs";
import AdminVersions from "./pages/admin/AdminVersions";
import AdminPasswordResets from "./pages/admin/AdminPasswordResets";
import AdminStaffUsers from "./pages/admin/AdminStaffUsers";

import NotFound from "./pages/NotFound";

function App() {
    return (
        <div className="App">
            <AuthProvider>
                <BrowserRouter>
                    <Toaster position="top-right" richColors />
                    <Routes>
                        {/* Public */}
                        <Route path="/" element={<Home />} />
                        <Route path="/projects" element={<Projects />} />
                        <Route path="/projects/:id" element={<ProjectDetail />} />
                        <Route path="/properties/:id" element={<PropertyDetail />} />
                        <Route path="/contact" element={<Contact />} />

                        {/* Auth */}
                        <Route path="/login/staff" element={<StaffLogin />} />
                        <Route path="/login/client" element={<ClientLogin />} />
                        <Route path="/login" element={<Navigate to="/login/staff" replace />} />
                        <Route path="/forgot-password" element={<ForgotPassword mode="client" />} />
                        <Route path="/staff/forgot-password" element={<ForgotPassword mode="staff" />} />
                        <Route path="/reset-password" element={<ResetPassword />} />

                        {/* Client portal */}
                        <Route
                            path="/portal"
                            element={
                                <ProtectedRoute allow="client">
                                    <ClientLayout />
                                </ProtectedRoute>
                            }
                        >
                            <Route index element={<ClientDashboard />} />
                            <Route path="reservations" element={<ClientReservations />} />
                            <Route path="payments" element={<ClientPayments />} />
                            <Route path="documents" element={<ClientDocuments />} />
                            <Route path="updates" element={<ClientUpdates />} />
                            <Route path="profile" element={<ClientProfile />} />
                            <Route path="messages" element={<ClientMessages />} />
                            <Route path="change-password" element={<ChangePassword mode="client" />} />
                        </Route>

                        {/* Admin */}
                        <Route
                            path="/admin"
                            element={
                                <ProtectedRoute allow="staff">
                                    <AdminLayout />
                                </ProtectedRoute>
                            }
                        >
                            <Route index element={<AdminDashboard />} />
                            <Route path="projects" element={<AdminProjects />} />
                            <Route path="properties" element={<AdminProperties />} />
                            <Route path="floor-plans" element={<AdminFloorPlans />} />
                            <Route path="import-docs" element={<AdminImportDocs />} />
                            <Route path="reservations" element={<AdminReservations />} />
                            <Route path="clients" element={<AdminClients />} />
                            <Route path="inquiries" element={<AdminInquiries />} />
                            <Route path="audit" element={<AdminAudit />} />
                            <Route path="versions" element={<AdminVersions />} />
                            <Route path="password-resets" element={<AdminPasswordResets />} />
                            <Route path="staff-users" element={<AdminStaffUsers />} />
                            <Route path="change-password" element={<ChangePassword mode="staff" />} />
                        </Route>

                        <Route path="*" element={<NotFound />} />
                    </Routes>
                </BrowserRouter>
            </AuthProvider>
        </div>
    );
}

export default App;
