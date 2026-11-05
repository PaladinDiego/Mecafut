import './globals.css';
import Navbar from '../components/Navbar';

export const metadata = {
  title: 'MECAFUT Q4 2026',
  description: 'Inscripciones y Gestión de Equipos MECAFUT Q4 2026 - Ing. Mecatrónica',
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body className="bg-gray-50 min-h-screen text-gray-900 flex flex-col justify-between">
        <Navbar />

        <main className="flex-1">
          {children}
        </main>

        <footer className="bg-white border-t py-4 text-center text-xs text-gray-500">
          <p>Mecafut Forms © 2026 — Desarrollado para gestión de inscripciones deportivas</p>
        </footer>
      </body>
    </html>
  );
}
