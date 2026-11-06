// scripts/patch-supabase-db.js
const fs = require("fs");
const path = require("path");

const dbServicePath = path.resolve(__dirname, "../lib/dbService.js");
let content = fs.readFileSync(dbServicePath, "utf8");

// 1. Agregar imports de supabase
content = content.replace(
  'import { initializeApp, getApps } from "firebase/app";',
  'import { initializeApp, getApps } from "firebase/app";\nimport { supabase, isSupabaseConfigured } from "./supabase";'
);

content = content.replace(
  'export const isFirebaseConfigured',
  'export { isSupabaseConfigured };\nexport const isFirebaseConfigured'
);

// 2. Parche en obtenerResumenPublico
const resumenSupabase = `export async function obtenerResumenPublico() {
  const ahora = new Date();
  const fechaFin = new Date(CONFIG_TORNEO.fechas.finInscripciones);
  const cerradoPorFecha = ahora > fechaFin;

  // MODO CLOUD SUPABASE (PostgreSQL)
  if (isSupabaseConfigured && supabase) {
    try {
      const [{ data: equiposDb }, { data: configRow }] = await Promise.all([
        supabase.from("equipos").select("*"),
        supabase.from("configuracion").select("data").eq("id", "general").maybeSingle()
      ]);

      const equipos = equiposDb || [];
      const config = configRow?.data || { inscripcionesAbiertas: true };

      const activos = equipos.filter(e => e.estado !== "Rechazado");
      const masculinoOcupados = activos.filter(e => (e.categoria || "Masculino") === "Masculino").length;
      const femeninoOcupados = activos.filter(e => e.categoria === "Femenino").length;

      const conteoColores = {};
      activos.forEach(e => {
        if (e.color) {
          const col = e.color.toLowerCase();
          conteoColores[col] = (conteoColores[col] || 0) + 1;
        }
      });

      const coloresLlenos = Object.keys(conteoColores).filter(col => conteoColores[col] >= 2);
      const inscripcionesHabilitadas = config.inscripcionesAbiertas !== false && !cerradoPorFecha;

      return {
        inscripcionesAbiertas: inscripcionesHabilitadas,
        cerradoPorFecha,
        masculinoOcupados,
        femeninoOcupados,
        maxMasculino: CONFIG_TORNEO.cupos.masculino,
        maxFemenino: CONFIG_TORNEO.cupos.femenino,
        conteoColores,
        coloresLlenos,
        equiposActivos: activos.map(e => ({
          id: e.id,
          nombre: e.nombre,
          categoria: e.categoria,
          capitan: e.capitan?.nombre,
          codigoAcceso: e.codigoAcceso || e.codigo,
          color: e.color
        })),
        nombresTomados: activos.map(e => (e.nombre || "").toLowerCase().trim()),
        modo: "supabase"
      };
    } catch (err) {
      console.warn("Fallo lectura en Supabase, recurriendo a fallback:", err);
    }
  }

  if (isFirebaseConfigured && db) {`;

content = content.replace(
  /export async function obtenerResumenPublico\(\) \{[\s\S]*?if \(isFirebaseConfigured && db\) \{/,
  resumenSupabase
);

// 3. Parche en inscribirEquipo
const inscribirSupabase = `  // -----------------------------------------------------------
  // MODO CLOUD SUPABASE (PostgreSQL)
  // -----------------------------------------------------------
  if (isSupabaseConfigured && supabase) {
    const { data: repetidos } = await supabase
      .from("jugadores")
      .select("cuenta, correo")
      .in("cuenta", cuentasInternas);

    if (repetidos && repetidos.length > 0) {
      const invalidos = repetidos
        .filter(j => !esDocenteAutorizado(j.correo))
        .map(j => j.cuenta);
      if (invalidos.length > 0) {
        throw new Error(\`Cuentas de estudiantes ya inscritas en otro equipo: \${invalidos.join(", ")}\`);
      }
    }

    const nuevoEquipoId = "eq-" + Date.now();
    const { error: errEq } = await supabase.from("equipos").insert({
      id: nuevoEquipoId,
      codigo: codigoAcceso,
      codigoAcceso,
      nombre: equipo.nombre.trim(),
      tipoEquipo: equipo.tipoEquipo || "Estudiantes",
      docente: equipo.docente,
      categoria: equipo.categoria || "Masculino",
      color: equipo.color,
      capitan: filaCapitan,
      comprobanteAdjunto: Boolean(comprobanteFile),
      comprobanteDataUrl,
      estado,
      pago: { estado: "pendiente" },
      fechaRegistro: new Date().toISOString()
    });

    if (errEq) {
      console.error("Error insertando equipo en Supabase:", errEq);
      throw new Error(\`Error en base de datos: \${errEq.message}\`);
    }

    const filasJugadores = plantillaCompleta.map((j, idx) => ({
      id: \`jug-\${nuevoEquipoId}-\${idx + 1}\`,
      equipo_id: nuevoEquipoId,
      equipoId: nuevoEquipoId,
      nombreEquipo: equipo.nombre.trim(),
      nombre: j.nombre.trim(),
      cuenta: j.cuenta.trim(),
      correo: j.correo?.trim().toLowerCase() || "",
      dni: j.dni || "",
      tipo_documento: j.tipoDocumento || "carnet",
      tipoDocumento: j.tipoDocumento || "carnet",
      foto_documento: j.fotoDocumento || null,
      fotoDocumento: j.fotoDocumento || null,
      carrera: j.carrera || CONFIG_TORNEO.carreras[0],
      codigo_clase: j.codigoClase || "N/A",
      codigoClase: j.codigoClase || "N/A",
      es_capitan: Boolean(j.esCapitan),
      esCapitan: Boolean(j.esCapitan)
    }));

    const { error: errJugs } = await supabase.from("jugadores").insert(filasJugadores);
    if (errJugs) {
      console.error("Error insertando jugadores en Supabase:", errJugs);
    }

    return { codigoAcceso, estado, modo: "supabase" };
  }

  // -----------------------------------------------------------
  // MODO CLOUD FIREBASE
  // -----------------------------------------------------------`;

content = content.replace(
  /\/\/ -----------------------------------------------------------\s*\n\s*\/\/ MODO CLOUD FIREBASE\s*\n\s*\/\/ -----------------------------------------------------------/,
  inscribirSupabase
);

// 4. Parche en buscarEquipoPorCodigo
const buscarSupabase = `export async function buscarEquipoPorCodigo(codigo) {
  if (!codigo?.trim()) throw new Error("Ingresa un código de acceso válido.");
  const codigoBuscado = codigo.trim();

  // MODO CLOUD SUPABASE (PostgreSQL)
  if (isSupabaseConfigured && supabase) {
    const { data: eq, error } = await supabase
      .from("equipos")
      .select("*")
      .or(\`codigoAcceso.eq.\${codigoBuscado},codigo.eq.\${codigoBuscado}\`)
      .maybeSingle();

    if (error || !eq) {
      throw new Error("No se encontró ningún equipo con ese código de acceso.");
    }

    const { data: jugs } = await supabase
      .from("jugadores")
      .select("*")
      .or(\`equipoId.eq.\${eq.id},equipo_id.eq.\${eq.id}\`);

    return {
      equipo: eq,
      jugadores: jugs || [],
      modo: "supabase"
    };
  }

  if (isFirebaseConfigured && db) {`;

content = content.replace(
  /export async function buscarEquipoPorCodigo\(codigo\) \{[\s\S]*?if \(isFirebaseConfigured && db\) \{/,
  buscarSupabase
);

// 5. Parche en agregarJugadorConCodigo
const agregarSupabase = `  // MODO CLOUD SUPABASE (PostgreSQL)
  if (isSupabaseConfigured && supabase) {
    if (!esDocente) {
      const { data: rep } = await supabase
        .from("jugadores")
        .select("id")
        .eq("cuenta", cuentaLimpia);
      if (rep && rep.length > 0) {
        throw new Error("Esta cuenta ya está registrada en otro equipo del torneo.");
      }
    }

    const nuevoId = \`jug-\${equipo.id}-\${Date.now()}\`;
    const registro = {
      id: nuevoId,
      equipo_id: equipo.id,
      equipoId: equipo.id,
      nombreEquipo: equipo.nombre,
      nombre: nuevoJugador.nombre.trim(),
      cuenta: cuentaLimpia,
      dni: dniLimpio,
      tipo_documento: tipoDoc,
      tipoDocumento: tipoDoc,
      foto_documento: fotoDoc,
      fotoDocumento: fotoDoc,
      correo: correoLimpio,
      carrera: nuevoJugador.carrera || CONFIG_TORNEO.carreras[0],
      codigo_clase: nuevoJugador.codigoClase?.trim() || "N/A",
      codigoClase: nuevoJugador.codigoClase?.trim() || "N/A",
      es_capitan: false,
      esCapitan: false
    };

    const { error: errJ } = await supabase.from("jugadores").insert(registro);
    if (errJ) {
      console.error("Error agregando jugador en Supabase:", errJ);
      throw new Error(\`Error en base de datos: \${errJ.message}\`);
    }

    return await buscarEquipoPorCodigo(codigoAcceso);
  }

  // MODO CLOUD FIREBASE
  if (isFirebaseConfigured && db) {`;

content = content.replace(
  /\/\/ MODO CLOUD FIREBASE\s*\n\s*if \(isFirebaseConfigured && db\) \{/,
  agregarSupabase
);

// 6. Parche en expulsarJugador
const expulsarSupabase = `  // MODO CLOUD SUPABASE
  if (isSupabaseConfigured && supabase) {
    await supabase.from("jugadores").delete().eq("id", jugadorId);
    return await buscarEquipoPorCodigo(codigoAcceso);
  }

  if (isFirebaseConfigured && db) {`;

content = content.replace(
  /if \(isFirebaseConfigured && db\) \{\s*\n\s*await deleteDoc\(doc\(db, "jugadores", jugadorId\)\);/,
  expulsarSupabase + '\n    await deleteDoc(doc(db, "jugadores", jugadorId));'
);

// 7. Parche en obtenerPerfilPendienteJugador
const pendienteSupabase = `export async function obtenerPerfilPendienteJugador(correo) {
  if (!correo) return null;
  const c = correo.trim().toLowerCase();

  // MODO CLOUD SUPABASE
  if (isSupabaseConfigured && supabase) {
    const { data: jugs } = await supabase.from("jugadores").select("*").eq("correo", c);
    if (jugs && jugs.length > 0) {
      const j = jugs[0];
      const esDocente = esDocenteAutorizado(j.correo);
      if (!esDocente && (!j.foto_documento && !j.fotoDocumento || !j.dni || j.dni === "Exento (Docente)")) {
        return { ...j, fotoDocumento: j.foto_documento || j.fotoDocumento, tipoDocumento: j.tipo_documento || j.tipoDocumento };
      }
    }
    return null;
  }

  if (isFirebaseConfigured && db) {`;

content = content.replace(
  /export async function obtenerPerfilPendienteJugador\(correo\) \{[\s\S]*?if \(isFirebaseConfigured && db\) \{/,
  pendienteSupabase
);

// 8. Parche en actualizarDocumentoJugador
const actualizarDocSupabase = `export async function actualizarDocumentoJugador({ jugadorId, dni, tipoDocumento, fotoDocumento, cuenta }) {
  if (!jugadorId) throw new Error("Identificador de jugador no válido.");

  // MODO CLOUD SUPABASE
  if (isSupabaseConfigured && supabase) {
    const updates = {};
    if (dni) updates.dni = dni.trim();
    if (tipoDocumento) {
      updates.tipoDocumento = tipoDocumento;
      updates.tipo_documento = tipoDocumento;
    }
    if (fotoDocumento) {
      updates.fotoDocumento = fotoDocumento;
      updates.foto_documento = fotoDocumento;
    }
    if (cuenta) updates.cuenta = cuenta.trim();

    await supabase.from("jugadores").update(updates).eq("id", jugadorId);
    return true;
  }

  if (isFirebaseConfigured && db) {`;

content = content.replace(
  /export async function actualizarDocumentoJugador\(\{ jugadorId, dni, tipoDocumento, fotoDocumento, cuenta \}\) \{[\s\S]*?if \(isFirebaseConfigured && db\) \{/,
  actualizarDocSupabase
);

// 9. Parche en obtenerEstadoTorneo
const estadoTorneoSupabase = `export async function obtenerEstadoTorneo() {
  // MODO CLOUD SUPABASE
  if (isSupabaseConfigured && supabase) {
    try {
      const { data } = await supabase.from("configuracion").select("data").eq("id", "torneo").maybeSingle();
      if (data?.data) return data.data;
      return SEED_TORNEO;
    } catch {
      return SEED_TORNEO;
    }
  }

  if (isFirebaseConfigured && db) {`;

content = content.replace(
  /export async function obtenerEstadoTorneo\(\) \{[\s\S]*?if \(isFirebaseConfigured && db\) \{/,
  estadoTorneoSupabase
);

// 10. Parche en suscribirTorneoEnVivo
const suscribirTorneoSupabase = `export function suscribirTorneoEnVivo(callback) {
  if (typeof window === "undefined") return () => {};

  // MODO CLOUD SUPABASE Realtime
  if (isSupabaseConfigured && supabase) {
    obtenerEstadoTorneo().then(callback);
    const channel = supabase
      .channel("torneo_live_realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "configuracion" }, (payload) => {
        if (payload.new && payload.new.id === "torneo") {
          callback(payload.new.data);
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }

  if (isFirebaseConfigured && db) {`;

content = content.replace(
  /export function suscribirTorneoEnVivo\(callback\) \{[\s\S]*?if \(isFirebaseConfigured && db\) \{/,
  suscribirTorneoSupabase
);

// 11. Parche en guardarTorneoCompleto
const guardarTorneoSupabase = `export async function guardarTorneoCompleto(torneoData) {
  // MODO CLOUD SUPABASE
  if (isSupabaseConfigured && supabase) {
    await supabase.from("configuracion").upsert({ id: "torneo", data: torneoData, actualizado_en: new Date().toISOString() });
    return torneoData;
  }

  if (isFirebaseConfigured && db) {`;

content = content.replace(
  /export async function guardarTorneoCompleto\(torneoData\) \{[\s\S]*?if \(isFirebaseConfigured && db\) \{/,
  guardarTorneoSupabase
);

// 12. Parche en obtenerDatosAdmin
const datosAdminSupabase = `export async function obtenerDatosAdmin() {
  // MODO CLOUD SUPABASE
  if (isSupabaseConfigured && supabase) {
    try {
      const [{ data: jData }, { data: eData }, { data: cData }, torneo] = await Promise.all([
        supabase.from("jugadores").select("*"),
        supabase.from("equipos").select("*"),
        supabase.from("configuracion").select("data").eq("id", "general").maybeSingle(),
        obtenerEstadoTorneo()
      ]);

      const jugadores = (jData || []).map(j => ({
        ...j,
        fotoDocumento: j.foto_documento || j.fotoDocumento,
        tipoDocumento: j.tipo_documento || j.tipoDocumento
      }));
      const equipos = eData || [];
      const configuracion = cData?.data || { inscripcionesAbiertas: true };

      return { jugadores, equipos, configuracion, torneo, modo: "supabase" };
    } catch (e) {
      console.warn("Fallo cargando datos admin de Supabase:", e);
    }
  }

  if (isFirebaseConfigured && db) {`;

content = content.replace(
  /export async function obtenerDatosAdmin\(\) \{[\s\S]*?if \(isFirebaseConfigured && db\) \{/,
  datosAdminSupabase
);

// 13. Parche en actualizarEstadoEquipo
const actualizarEstadoSupabase = `export async function actualizarEstadoEquipo(equipoId, nuevoEstado) {
  // MODO CLOUD SUPABASE
  if (isSupabaseConfigured && supabase) {
    await supabase.from("equipos").update({ estado: nuevoEstado, actualizado_en: new Date().toISOString() }).eq("id", equipoId);
    return true;
  }

  if (isFirebaseConfigured && db) {`;

content = content.replace(
  /export async function actualizarEstadoEquipo\(equipoId, nuevoEstado\) \{[\s\S]*?if \(isFirebaseConfigured && db\) \{/,
  actualizarEstadoSupabase
);

// 14. Parche en eliminarEquipoAdmin
const eliminarEquipoSupabase = `export async function eliminarEquipoAdmin(equipoId) {
  // MODO CLOUD SUPABASE
  if (isSupabaseConfigured && supabase) {
    await supabase.from("jugadores").delete().or(\`equipoId.eq.\${equipoId},equipo_id.eq.\${equipoId}\`);
    await supabase.from("equipos").delete().eq("id", equipoId);
    return true;
  }

  if (isFirebaseConfigured && db) {`;

content = content.replace(
  /export async function eliminarEquipoAdmin\(equipoId\) \{[\s\S]*?if \(isFirebaseConfigured && db\) \{/,
  eliminarEquipoSupabase
);

// 15. Parche en cambiarEstadoInscripciones
const cambiarInscripcionesSupabase = `export async function cambiarEstadoInscripciones(abiertas) {
  // MODO CLOUD SUPABASE
  if (isSupabaseConfigured && supabase) {
    await supabase.from("configuracion").upsert({ id: "general", data: { inscripcionesAbiertas: abiertas }, actualizado_en: new Date().toISOString() });
    return true;
  }

  if (isFirebaseConfigured && db) {`;

content = content.replace(
  /export async function cambiarEstadoInscripciones\(abiertas\) \{[\s\S]*?if \(isFirebaseConfigured && db\) \{/,
  cambiarInscripcionesSupabase
);

fs.writeFileSync(dbServicePath, content, "utf8");
console.log("✅ lib/dbService.js actualizado con soporte para Supabase.");
