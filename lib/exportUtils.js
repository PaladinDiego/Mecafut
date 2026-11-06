// lib/exportUtils.js
// Generador oficial de documentos Excel (.xlsx) y PDF para MECAFUT 2026

import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import "jspdf-autotable";
import { CONFIG_TORNEO } from "./torneoConfig";

/**
 * Genera y descarga el archivo Excel oficial con las 4 hojas reglamentarias del torneo.
 */
export function exportarExcelOficial(equipos = [], jugadores = []) {
  const wb = XLSX.utils.book_new();

  // -------------------------------------------------------------
  // HOJA 1: Resumen de Equipos
  // -------------------------------------------------------------
  const resumenData = equipos.map((e, idx) => {
    const totalJugadores = jugadores.filter(j => j.equipoId === e.id).length;
    return {
      "#": idx + 1,
      "Tipo": e.tipoEquipo || "Estudiantes",
      "Nombre del Equipo": e.nombre,
      "Capitán": e.capitan?.nombre || "",
      "Teléfono Capitán": e.capitan?.telefono || "",
      "Correo Capitán": e.capitan?.correo || "",
      "N° Cuenta Capitán": e.capitan?.cuenta || "",
      "Docente Asesor": e.docente || "",
      "Categoría": e.categoria || "Masculino",
      "Color de Uniforme": e.color || "",
      "Estado": e.estado || "Pendiente",
      "Total Integrantes": totalJugadores,
      "Código Acceso": e.codigoAcceso || "",
      "Fecha de Inscripción": e.fechaRegistro ? new Date(e.fechaRegistro).toLocaleString("es-HN") : ""
    };
  });
  const wsResumen = XLSX.utils.json_to_sheet(resumenData.length ? resumenData : [{ "Aviso": "Sin equipos registrados" }]);
  XLSX.utils.book_append_sheet(wb, wsResumen, "Resumen Equipos");

  // -------------------------------------------------------------
  // HOJA 2: Lista General de Jugadores
  // -------------------------------------------------------------
  const jugadoresData = jugadores
    .slice()
    .sort((a, b) => (a.nombreEquipo || "").localeCompare(b.nombreEquipo || "") || (a.nombre || "").localeCompare(b.nombre || ""))
    .map((j, idx) => ({
      "#": idx + 1,
      "Equipo": j.nombreEquipo,
      "Rol": j.esCapitan ? "Capitán (Jugador #1)" : "Jugador",
      "Nombre Completo": j.nombre,
      "N° Cuenta": j.cuenta,
      "N° Identidad (DNI)": j.dni || "N/A",
      "Doc. Verificado": j.fotoDocumento ? (j.tipoDocumento === "carnet" ? "Carnet Universitario" : "Hoja Matrícula") : "Pendiente",
      "Correo Institucional": j.correo || "",
      "Carrera": j.carrera,
      "Código de Clase": j.codigoClase || "N/A"
    }));
  const wsJugadores = XLSX.utils.json_to_sheet(jugadoresData.length ? jugadoresData : [{ "Aviso": "Sin jugadores registrados" }]);
  XLSX.utils.book_append_sheet(wb, wsJugadores, "Lista Jugadores");

  // -------------------------------------------------------------
  // HOJA 3: Planillas Imprimibles (Solo equipos Confirmados)
  // -------------------------------------------------------------
  const equiposConfirmados = equipos.filter(e => (e.estado || "Pendiente").toLowerCase() === "confirmado");
  const planillasRows = [];

  if (equiposConfirmados.length === 0) {
    planillasRows.push({ "Aviso": "No hay equipos con estado 'Confirmado' todavía. Valida comprobantes en el panel administrativo." });
  } else {
    equiposConfirmados.forEach((eq, eqIdx) => {
      const integrantes = jugadores.filter(j => j.equipoId === eq.id);
      integrantes.forEach((j, jIdx) => {
        planillasRows.push({
          "Equipo": eq.nombre,
          "Categoría": eq.categoria,
          "Color": eq.color,
          "Docente": eq.docente,
          "# Jugador": jIdx + 1,
          "Nombre": j.nombre,
          "N° Cuenta": j.cuenta,
          "N° Identidad (DNI)": j.dni || "N/A",
          "Carrera": j.carrera,
          "Firma / Asistencia": "________________",
          "Goles": "",
          "T. Amarilla": "",
          "T. Roja": ""
        });
      });
      // Fila separadora entre equipos
      planillasRows.push({});
    });
  }
  const wsPlanillas = XLSX.utils.json_to_sheet(planillasRows);
  XLSX.utils.book_append_sheet(wb, wsPlanillas, "Planillas Imprimibles");

  // -------------------------------------------------------------
  // HOJA 4: Pendientes y Observaciones
  // -------------------------------------------------------------
  const noConfirmados = equipos.filter(e => (e.estado || "Pendiente").toLowerCase() !== "confirmado");
  const pendientesData = noConfirmados.map((e, idx) => {
    const totalJugadores = jugadores.filter(j => j.equipoId === e.id).length;
    let motivo = "Esperando validación de comprobante bancario";
    if (e.estado === "Rechazado") motivo = "Inscripción rechazada por el organizador";
    if (totalJugadores < CONFIG_TORNEO.plantilla.min) motivo += ` | Plantilla incompleta (${totalJugadores}/${CONFIG_TORNEO.plantilla.min} mínimos)`;

    return {
      "#": idx + 1,
      "Equipo": e.nombre,
      "Capitán": e.capitan?.nombre || "",
      "Teléfono": e.capitan?.telefono || "",
      "Estado Actual": e.estado || "Pendiente",
      "Total Integrantes": totalJugadores,
      "Motivo / Acción Requerida": motivo
    };
  });
  const wsPendientes = XLSX.utils.json_to_sheet(pendientesData.length ? pendientesData : [{ "Aviso": "¡Excelente! Todos los equipos están confirmados." }]);
  XLSX.utils.book_append_sheet(wb, wsPendientes, "Pendientes");

  // Descargar el libro Excel
  const filename = `Mecafut_${CONFIG_TORNEO.periodo.replace(/\s+/g, "_")}_Inscripciones.xlsx`;
  XLSX.writeFile(wb, filename);
}

/**
 * Genera y descarga el PDF oficial para planillas de arbitraje y mesas técnicas.
 */
export function exportarPDFPlanillas(equipos = [], jugadores = []) {
  const doc = new jsPDF();
  const fechaHoy = new Date().toLocaleDateString("es-HN", { dateStyle: "long" });

  doc.setFontSize(16);
  doc.setTextColor(23, 37, 84); // Azul oscuro
  doc.text(`PLANILLAS OFICIALES — ${CONFIG_TORNEO.titulo}`, 14, 16);
  doc.setFontSize(9);
  doc.setTextColor(100);
  doc.text(`Generado el: ${fechaHoy} | Total Equipos: ${equipos.length} | Total Jugadores: ${jugadores.length}`, 14, 23);

  const equiposAExportar = equipos.slice().sort((a, b) => a.nombre.localeCompare(b.nombre));

  let startY = 30;

  equiposAExportar.forEach((eq, index) => {
    const integrantes = jugadores.filter(j => j.equipoId === eq.id);

    if (startY > 230) {
      doc.addPage();
      startY = 20;
    }

    doc.setFontSize(11);
    doc.setTextColor(23, 37, 84);
    doc.text(`${index + 1}. ${eq.nombre} (${eq.categoria}) — Uniforme: ${eq.color || "No asignado"}`, 14, startY);
    doc.setFontSize(8);
    doc.setTextColor(75);
    doc.text(`Capitán: ${eq.capitan?.nombre || "N/A"} (${eq.capitan?.telefono || ""}) | Docente: ${eq.docente || "N/A"} | Estado: ${eq.estado || "Pendiente"}`, 14, startY + 5);

    doc.autoTable({
      startY: startY + 8,
      head: [["#", "Jugador", "Cuenta", "DNI", "Carrera", "Firma"]],
      body: integrantes.map((j, i) => [
        i + 1,
        j.nombre + (j.esCapitan ? " (C)" : ""),
        j.cuenta,
        j.dni || "N/A",
        j.carrera,
        "__________________"
      ]),
      styles: { fontSize: 7, cellPadding: 2 },
      headStyles: { fillColor: [30, 58, 138] },
      margin: { left: 14, right: 14 }
    });

    startY = doc.lastAutoTable.finalY + 12;
  });

  doc.save(`planillas_oficiales_mecafut.pdf`);
}
