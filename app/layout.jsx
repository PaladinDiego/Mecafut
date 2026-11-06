import './globals.css';
import Navbar from '../components/Navbar';
import ReglamentoModal from '../components/ReglamentoModal';
import AuthGate from '../components/AuthGate';

export const metadata = {
  title: 'MECAFUT Q4 2026',
  description: 'Inscripciones y Gestión de Equipos MECAFUT Q4 2026 - Ing. Mecatrónica',
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body className="bg-gray-50 min-h-screen text-gray-900 flex flex-col justify-between">
        <ReglamentoModal />
        <Navbar />

        <main className="flex-1">
          <AuthGate>
            {children}
          </AuthGate>
        </main>

        <footer className="bg-white border-t py-4 text-center text-xs text-gray-500">
          <p>Mecafut Forms © 2026 — Plataforma Oficial Torneo de Fútbol Ingeniería Mecatrónica</p>
        </footer>
      </body>
    </html>
  );
}
