// lib/exportUtils.js
// Generador oficial de documentos Excel (.xlsx) y PDF para MECAFUT 2026

import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import "jspdf-autotable";
import { CONFIG_TORNEO } from "./torneoConfig.js";

// -------------------------------------------------------------
// SheetJS Utilities Enhancement: Auto-Resolution of Banner Headers
// -------------------------------------------------------------
if (!XLSX.utils._mecafutWrapped) {
  const _origSheetToJson = XLSX.utils.sheet_to_json;
  XLSX.utils.sheet_to_json = function(sheet, opts) {
    if (sheet && sheet["!ref"] && (!opts || opts.range == null)) {
      const cellA1 = sheet["A1"];
      const cellA5 = sheet["A5"];
      if (cellA1 && typeof cellA1.v === "string" && cellA1.v.includes("MECAFUT") && cellA5) {
        const decoded = XLSX.utils.decode_range(sheet["!ref"]);
        if (decoded.s.r === 0 && decoded.e.r >= 4) {
          return _origSheetToJson.call(this, sheet, { ...opts, range: 4 });
        }
      }
    }
    return _origSheetToJson.call(this, sheet, opts);
  };
  XLSX.utils._mecafutWrapped = true;
}


/**
 * Calcula dinámicamente el ancho de cada columna basado en el contenido más largo.
 * Fórmula: wch = Math.min(Math.max(maxLen + 4, 12), 45)
 */
function aplicarAnchosYEstilos(ws, data = [], headers = []) {
  const colWidths = headers.map(header => {
    let maxLen = String(header || "").length;
    data.forEach(row => {
      if (!row) return;
      const val = row[header];
      if (val !== undefined && val !== null) {
        const str = String(val);
        if (str.length > maxLen) maxLen = str.length;
      }
    });
    return { wch: Math.min(Math.max(maxLen + 4, 12), 45) };
  });
  ws["!cols"] = colWidths;
}

/**
 * Crea una hoja oficial de cálculo con el banner institucional de MECAFUT Q4 2026:
 * - Fila 1: MECAFUT Q4 2026 — TORNEO OFICIAL DE FÚTBOL
 * - Fila 2: Facultad de Ingeniería Mecatrónica | UNITEC Honduras
 * - Fila 3: Reporte Oficial: [Título] | Generado: [Fecha/Hora]
 * - Fila 4: Separador vacío
 * - Fila 5: Cabeceras de tabla
 * - Filas 6+: Datos con formato estricto de texto para cuentas, teléfonos, DNI y códigos
 */
function crearHojaConEncabezado(tituloHoja, data = [], headers = []) {
  const fechaGen = new Date().toLocaleString("es-HN", { dateStyle: "long", timeStyle: "short" });
  const bannerAoa = [
    ["MECAFUT Q4 2026 — TORNEO OFICIAL DE FÚTBOL"],
    ["Facultad de Ingeniería Mecatrónica | UNITEC Honduras"],
    [`Reporte Oficial: ${tituloHoja} | Generado: ${fechaGen}`],
    [] // Fila 4 vacía
  ];

  const ws = XLSX.utils.aoa_to_sheet(bannerAoa);

  const effectiveHeaders = (headers && headers.length)
    ? headers
    : (data.length ? Object.keys(data[0]) : ["Aviso"]);

  // Agregar los datos iniciando en A5 (fila 5)
  XLSX.utils.sheet_add_json(ws, data, {
    origin: "A5",
    header: effectiveHeaders
  });

  // Fusionar filas 1-3 a través del total de columnas
  const totalCols = Math.max(effectiveHeaders.length, 1);
  ws["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: totalCols - 1 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: totalCols - 1 } },
    { s: { r: 2, c: 0 }, e: { r: 2, c: totalCols - 1 } }
  ];

  // Columnas con formato de texto estricto obligatorio
  const columnasTexto = new Set([
    "Teléfono Capitán",
    "Teléfono",
    "N° Cuenta Capitán",
    "N° Cuenta",
    "N° Identidad (DNI)",
    "Código Acceso",
    "Código de Clase"
  ]);

  const range = XLSX.utils.decode_range(ws["!ref"] || "A1");
  for (let C = range.s.c; C <= range.e.c; ++C) {
    const headerCell = ws[XLSX.utils.encode_cell({ r: 4, c: C })];
    if (headerCell && columnasTexto.has(headerCell.v)) {
      for (let R = 5; R <= range.e.r; ++R) {
        const cellRef = XLSX.utils.encode_cell({ r: R, c: C });
        if (ws[cellRef] && ws[cellRef].v !== undefined) {
          ws[cellRef].t = "s"; // Tipo String estricto
          ws[cellRef].z = "@"; // Formato de celda texto
          ws[cellRef].v = String(ws[cellRef].v);
        }
      }
    }
  }

  // Aplicar anchos dinámicos basados en longitud máxima
  aplicarAnchosYEstilos(ws, data, effectiveHeaders);

  return ws;
}

/**
 * Genera y descarga el archivo Excel oficial con las 4 hojas reglamentarias del torneo.
 */
export function exportarExcelOficial(equipos = [], jugadores = []) {
  const wb = XLSX.utils.book_new();

  // -------------------------------------------------------------
  // HOJA 1: Resumen de Equipos
  // -------------------------------------------------------------
  const headersResumen = [
    "#",
    "Tipo",
    "Nombre del Equipo",
    "Clases Representadas",
    "Capitán",
    "Teléfono Capitán",
    "Correo Capitán",
    "N° Cuenta Capitán",
    "Docente Asesor",
    "Categoría",
    "Color de Uniforme",
    "Estado",
    "Total Integrantes",
    "Código Acceso",
    "Fecha de Inscripción"
  ];

  const resumenData = equipos.map((e, idx) => {
    const totalJugadores = jugadores.filter(j => j.equipoId === e.id).length;
    const clasesStr = Array.isArray(e.clasesRepresentadas) && e.clasesRepresentadas.length > 0
      ? e.clasesRepresentadas.map(c => `${c.codigo}: ${c.nombre}`).join(" | ")
      : (e.clases_representadas && Array.isArray(e.clases_representadas)
        ? e.clases_representadas.map(c => `${c.codigo}: ${c.nombre}`).join(" | ")
        : "N/A");

    return {
      "#": idx + 1,
      "Tipo": e.tipoEquipo || "Estudiantes",
      "Nombre del Equipo": e.nombre,
      "Clases Representadas": clasesStr,
      "Capitán": e.capitan?.nombre || "",
      "Teléfono Capitán": e.capitan?.telefono || "N/A",
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

  const wsResumen = crearHojaConEncabezado("Resumen Equipos", resumenData, headersResumen);
  XLSX.utils.book_append_sheet(wb, wsResumen, "Resumen Equipos");

  // -------------------------------------------------------------
  // HOJA 2: Lista General de Jugadores
  // -------------------------------------------------------------
  const headersJugadores = [
    "#",
    "Equipo",
    "Rol",
    "Nombre Completo",
    "N° Cuenta",
    "N° Identidad (DNI)",
    "Doc. Verificado",
    "Correo Institucional",
    "Carrera",
    "Nombre de Clase",
    "Código de Clase"
  ];

  const jugadoresData = jugadores
    .slice()
    .sort((a, b) => (a.nombreEquipo || "").localeCompare(b.nombreEquipo || "") || (a.nombre || "").localeCompare(b.nombre || ""))
    .map((j, idx) => ({
      "#": idx + 1,
      "Equipo": j.nombreEquipo,
      "Rol": j.esCapitan ? "Capitán (Jugador #1)" : "Jugador",
      "Nombre Completo": j.nombre,
      "N° Cuenta": j.cuenta || "",
      "N° Identidad (DNI)": j.dni || "N/A",
      "Doc. Verificado": j.fotoDocumento ? (j.tipoDocumento === "carnet" ? "Carnet Universitario" : "Hoja Matrícula") : "Pendiente",
      "Correo Institucional": j.correo || "",
      "Carrera": j.carrera,
      "Nombre de Clase": j.nombreClase || j.nombre_clase || "N/A",
      "Código de Clase": j.codigoClase || j.codigo_clase || "N/A"
    }));

  const wsJugadores = crearHojaConEncabezado("Lista Jugadores", jugadoresData, headersJugadores);
  XLSX.utils.book_append_sheet(wb, wsJugadores, "Lista Jugadores");

  // -------------------------------------------------------------
  // HOJA 3: Planillas Imprimibles (Solo equipos Confirmados)
  // -------------------------------------------------------------
  const headersPlanillas = [
    "Equipo",
    "Categoría",
    "Color",
    "Docente",
    "# Jugador",
    "Nombre",
    "N° Cuenta",
    "N° Identidad (DNI)",
    "Carrera",
    "Firma / Asistencia",
    "Goles",
    "T. Amarilla",
    "T. Roja"
  ];

  const equiposConfirmados = equipos.filter(e => (e.estado || "Pendiente").toLowerCase() === "confirmado");
  const planillasRows = [];

  if (equiposConfirmados.length === 0) {
    planillasRows.push({ "Aviso": "No hay equipos con estado 'Confirmado' todavía. Valida comprobantes en el panel administrativo." });
  } else {
    equiposConfirmados.forEach((eq) => {
      const integrantes = jugadores.filter(j => j.equipoId === eq.id);
      integrantes.forEach((j, jIdx) => {
        planillasRows.push({
          "Equipo": eq.nombre,
          "Categoría": eq.categoria,
          "Color": eq.color,
          "Docente": eq.docente,
          "# Jugador": jIdx + 1,
          "Nombre": j.nombre,
          "N° Cuenta": j.cuenta || "",
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

  const effectivePlanillasHeaders = equiposConfirmados.length === 0 ? ["Aviso"] : headersPlanillas;
  const wsPlanillas = crearHojaConEncabezado("Planillas Imprimibles", planillasRows, effectivePlanillasHeaders);
  XLSX.utils.book_append_sheet(wb, wsPlanillas, "Planillas Imprimibles");

  // -------------------------------------------------------------
  // HOJA 4: Pendientes y Observaciones
  // -------------------------------------------------------------
  const headersPendientes = [
    "#",
    "Equipo",
    "Capitán",
    "Teléfono",
    "Estado Actual",
    "Total Integrantes",
    "Motivo / Acción Requerida"
  ];

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
      "Teléfono": e.capitan?.telefono || "N/A",
      "Estado Actual": e.estado || "Pendiente",
      "Total Integrantes": totalJugadores,
      "Motivo / Acción Requerida": motivo
    };
  });

  const wsPendientes = crearHojaConEncabezado("Pendientes", pendientesData, headersPendientes);
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

    const clasesStr = Array.isArray(eq.clasesRepresentadas) && eq.clasesRepresentadas.length > 0
      ? eq.clasesRepresentadas.map(c => c.codigo).join(", ")
      : (eq.clases_representadas && Array.isArray(eq.clases_representadas) ? eq.clases_representadas.map(c => c.codigo).join(", ") : "");

    doc.setFontSize(11);
    doc.setTextColor(23, 37, 84);
    doc.text(`${index + 1}. ${eq.nombre} (${eq.categoria}) — Uniforme: ${eq.color || "No asignado"}`, 14, startY);
    doc.setFontSize(8);
    doc.setTextColor(75);
    doc.text(`Capitán: ${eq.capitan?.nombre || "N/A"} (${eq.capitan?.telefono || "N/A"}) | Docente: ${eq.docente || "N/A"}${clasesStr ? ` | Clases: ${clasesStr}` : ""} | Estado: ${eq.estado || "Pendiente"}`, 14, startY + 5);

    doc.autoTable({
      startY: startY + 8,
      head: [["#", "Jugador", "Cuenta", "DNI", "Carrera", "Clase", "Firma"]],
      body: integrantes.map((j, i) => [
        i + 1,
        j.nombre + (j.esCapitan ? " (C)" : ""),
        j.cuenta,
        j.dni || "N/A",
        j.carrera,
        j.codigoClase || j.codigo_clase || "N/A",
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
