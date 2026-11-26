import { Navigate, Route, Routes } from "react-router-dom";
import { PublicOnly, RequireNotOnboarded, RequireOnboarded, RequirePlatformAdmin } from "./components/guards";
import { PlatformPage } from "./pages/PlatformPage";
import { AdminAppointmentsPage } from "./pages/AdminAppointmentsPage";
import { AdminCustomersPage } from "./pages/AdminCustomersPage";
import { AdminSchedulePage } from "./pages/AdminSchedulePage";
import { AdminServicesPage } from "./pages/AdminServicesPage";
import { LoginPage } from "./pages/LoginPage";
import { ForgotPasswordPage, ResetPasswordPage } from "./pages/PasswordResetPages";
import { PrivacyPolicyPage, TermsOfServicePage } from "./pages/LegalPage";
import { OnboardingPage } from "./pages/OnboardingPage";
import { PublicBookingPage } from "./pages/PublicBookingPage";
import { RegisterPage } from "./pages/RegisterPage";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/admin" replace />} />

      <Route element={<PublicOnly />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/registro" element={<RegisterPage />} />
        <Route path="/esqueci-senha" element={<ForgotPasswordPage />} />
        <Route path="/redefinir-senha" element={<ResetPasswordPage />} />
      </Route>

      <Route path="/privacidade" element={<PrivacyPolicyPage />} />
      <Route path="/termos" element={<TermsOfServicePage />} />

      <Route element={<RequirePlatformAdmin />}>
        <Route path="/plataforma" element={<PlatformPage />} />
      </Route>

      <Route element={<RequireNotOnboarded />}>
        <Route path="/onboarding" element={<OnboardingPage />} />
      </Route>

      <Route element={<RequireOnboarded />}>
        <Route path="/admin" element={<AdminServicesPage />} />
        <Route path="/admin/horarios" element={<AdminSchedulePage />} />
        <Route path="/admin/agendamentos" element={<AdminAppointmentsPage />} />
        <Route path="/admin/clientes" element={<AdminCustomersPage />} />
      </Route>

      {/* Página pública do estabelecimento. Segmentos estáticos (/login, /admin...)
          têm prioridade sobre o dinâmico no React Router, e o backend recusa
          slugs reservados no onboarding, então não há colisão. */}
      <Route path="/:slug" element={<PublicBookingPage />} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
