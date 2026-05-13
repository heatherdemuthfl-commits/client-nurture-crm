import { useState, useEffect, useCallback, useRef } from "react";
import { createClient } from "@supabase/supabase-js";

// ─── Supabase ───
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "";
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY || "";
const supabase = SUPABASE_URL && SUPABASE_KEY ? createClient(SUPABASE_URL, SUPABASE_KEY) : null;

// ─── Constants ───
const BUYER_STAGES = [
  { key: "day3", label: "Welcome Home", days: 3, icon: "\u{1F3E0}", desc: "Congrats, home binder, warranty info, vendor list" },
  { key: "day14", label: "Settling In", days: 14, icon: "\u{1F4E6}", desc: "How's the move? Need contractor recs?" },
  { key: "day45", label: "Check-in", days: 45, icon: "\u{1F44B}", desc: "How's the neighborhood? Everything working?" },
  { key: "day90", label: "Maintenance", days: 90, icon: "\u{1F527}", desc: "Seasonal maintenance checklist + home value update" },
  { key: "day180", label: "6-Month Update", days: 180, icon: "\u{1F4CA}", desc: "Market update, home value estimate" },
  { key: "day270", label: "9-Month Touch", days: 270, icon: "\u{1F91D}", desc: "Local events, soft referral ask" },
  { key: "day365", label: "Anniversary", days: 365, icon: "\u{1F382}", desc: "Happy home anniversary! CMA update + referral ask" },
  { key: "ongoing", label: "Quarterly", days: 999, icon: "\u267B\uFE0F", desc: "Market stats, local content, seasonal tips" },
];

const SELLER_STAGES = [
  { key: "day3", label: "Thank You", days: 3, icon: "\u{1F4DD}", desc: "Thanks for trusting me, final docs reminder" },
  { key: "day14", label: "Next Chapter", days: 14, icon: "\u2728", desc: "How's the transition? Need anything?" },
  { key: "day45", label: "Stay Connected", days: 45, icon: "\u{1F44B}", desc: "Personal check-in, local update" },
  { key: "day90", label: "Life Update", days: 90, icon: "\u2615", desc: "How are you settling in? Open-ended" },
  { key: "day180", label: "6-Month Touch", days: 180, icon: "\u{1F4AC}", desc: "Thinking of you + old neighborhood market update" },
  { key: "day365", label: "Anniversary", days: 365, icon: "\u{1F382}", desc: "One year since we closed! Referral ask" },
  { key: "ongoing", label: "Quarterly", days: 999, icon: "\u267B\uFE0F", desc: "Newsletter, market stats, stay top of mind" },
];

const getStagesForType = (type) => {
  if (type === "Seller") return SELLER_STAGES;
  return BUYER_STAGES; // Buyer and Both default to buyer timeline
};

const REFERRAL_LEVELS = [
  { value: 1, label: "Low", color: "#94a3b8" },
  { value: 2, label: "Medium", color: "#f59e0b" },
  { value: 3, label: "High", color: "#22c55e" },
  { value: 4, label: "VIP", color: "#8b5cf6" },
];

const FLODESK_SEGMENTS = [
  "Past Clients", "Post-Close Sequence", "Monthly Newsletter",
  "Seasonal Updates", "VIP Circle", "Referral Partners", "Anniversary Drip"
];

const TRANSACTION_TYPES = [
  { value: "Buyer", label: "Buyer", color: "#3b82f6", icon: "🔑" },
  { value: "Seller", label: "Seller", color: "#f59e0b", icon: "🏠" },
  { value: "Both", label: "Both", color: "#8b5cf6", icon: "🔄" },
];

const TOUCHPOINT_TYPES = [
  { key: "email", label: "Email", icon: "\u2709\uFE0F" },
  { key: "call", label: "Call", icon: "\u{1F4DE}" },
  { key: "text", label: "Text", icon: "\u{1F4AC}" },
  { key: "card", label: "Card/Gift", icon: "\u{1F381}" },
  { key: "social", label: "Social", icon: "\u{1F4F1}" },
  { key: "inperson", label: "In Person", icon: "\u{1F91D}" },
];

const DEFAULT_CLIENT = {
  name: "", email: "", phone: "", address: "",
  close_date: "", purchase_price: "", property_type: "Single Family",
  transaction_type: "Buyer", referral_potential: 2, flodesk_segments: ["Past Clients"],
  touchpoints: [], notes: "", tags: [], source: "Manual",
};

// ─── Helpers ───
const daysSince = (dateStr) => {
  if (!dateStr) return 0;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
};
const getCurrentStage = (closeDate, type) => {
  const stages = getStagesForType(type);
  const d = daysSince(closeDate);
  for (let i = stages.length - 1; i >= 0; i--) {
    if (d >= stages[i].days || i === stages.length - 1) {
      if (i === stages.length - 1) return stages[i];
      return stages[i + 1] || stages[i];
    }
  }
  return stages[0];
};
const getStageIndex = (closeDate, type) => {
  const stages = getStagesForType(type);
  const d = daysSince(closeDate);
  for (let i = stages.length - 1; i >= 0; i--) {
    if (d >= stages[i].days) return i;
  }
  return 0;
};
const formatDate = (d) => d ? new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "\u2014";
const daysUntilAnniversary = (closeDate) => {
  if (!closeDate) return 999;
  const cd = new Date(closeDate);
  const now = new Date();
  const nextAnn = new Date(now.getFullYear(), cd.getMonth(), cd.getDate());
  if (nextAnn < now) nextAnn.setFullYear(nextAnn.getFullYear() + 1);
  return Math.floor((nextAnn - now) / 86400000);
};

// ─── CSV Parser ───
const parseCSV = (text) => {
  const lines = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') { inQuotes = !inQuotes; continue; }
    if (c === "\n" && !inQuotes) { lines.push(current); current = ""; continue; }
    if (c === "\r" && !inQuotes) continue;
    current += c;
  }
  if (current) lines.push(current);
  const splitRow = (row) => {
    const cols = []; let cur = ""; let q = false;
    for (let i = 0; i < row.length; i++) {
      if (row[i] === '"') { q = !q; continue; }
      if (row[i] === "," && !q) { cols.push(cur.trim()); cur = ""; continue; }
      cur += row[i];
    }
    cols.push(cur.trim());
    return cols;
  };
  if (lines.length < 2) return [];
  const headers = splitRow(lines[0]).map(h => h.toLowerCase().replace(/[^a-z0-9]/g, "").trim());
  return lines.slice(1).filter(l => l.trim()).map(line => {
    const vals = splitRow(line);
    const obj = {};
    headers.forEach((h, i) => { obj[h] = (vals[i] || "").replace(/`/g, "").trim(); });
    return obj;
  });
};

const mapCSVToClient = (row) => {
  // Direct Lofty column mapping
  const g = (key) => (row[key] || "").trim();

  // Name: Lofty uses "firstname" and "lastname"
  const firstName = g("firstname") || g("first");
  const lastName = g("lastname") || g("last");
  const fullName = [firstName, lastName].filter(Boolean).join(" ");

  // Email: Lofty uses "primaryemail"
  const email = g("primaryemail") || g("email") || g("otheremail") || g("mail");

  // Phone: Lofty uses "primaryphone"
  const phone = g("primaryphone") || g("phone") || g("otherphone") || g("mobile") || g("cell");

  // Address: Lofty uses "streetaddressmailingaddress", "citymailingaddress", etc.
  const street = g("streetaddressmailingaddress") || g("streetaddresssellingproperty1") || g("streetaddressbuyingproperty1") || g("address") || g("street");
  const city = g("citymailingaddress") || g("citysellingproperty1") || g("citybuyingproperty1") || g("city") || g("citypreference");
  const state = g("provincemailingaddress") || g("provincesellingproperty1") || g("provincebuyingproperty1") || g("state");
  const zip = g("postalcodemailingaddress") || g("postalcodesellingproperty1") || g("postalcodebuyingproperty1") || g("zip") || g("postal");
  const address = [street, city, state].filter(Boolean).join(", ") + (zip ? " " + zip : "");

  // Close date: Lofty "customfieldhomeanniversary" or parse from tags
  const closeDate = g("customfieldhomeanniversary") || g("closedate") || g("close") || "";

  // Parse close date — Lofty formats as "Jul 08, 2025" or similar
  let parsedDate = null;
  if (closeDate && closeDate.length > 5 && /[a-zA-Z]/.test(closeDate)) {
    try {
      const d = new Date(closeDate);
      if (!isNaN(d.getTime()) && d.getFullYear() > 1990 && d.getFullYear() < 2100) {
        parsedDate = d.toISOString().split("T")[0];
      }
    } catch {}
  }

  // Lead type from Lofty
  const leadType = g("leadtype") || "";

  // Tags from Lofty
  const tags = g("tag") ? g("tag").split("|").map(t => t.trim()).filter(Boolean) : [];

  // Notes from Lofty
  const notes = [g("note1"), g("note2"), g("note3"), g("note4"), g("note5")]
    .filter(Boolean)
    .map(n => n.replace(/&nbsp;/g, " ").replace(/<[^>]*>/g, "").trim())
    .join("\n");

  // Spouse from custom field
  const spouse = g("customfieldspouse");
  const fullNotes = [notes, spouse ? `Spouse: ${spouse}` : ""].filter(Boolean).join("\n");

  // Source
  const source = g("source") || "Lofty Import";

  return {
    name: fullName || "Unknown",
    email: email || null,
    phone: phone || null,
    address: address || null,
    close_date: parsedDate,
    purchase_price: null,
    property_type: "Single Family",
    referral_potential: 2,
    source: source === "CSV Import" ? "Lofty Import" : (source || "Lofty Import"),
    flodesk_segments: ["Past Clients"],
    touchpoints: [],
    notes: fullNotes || null,
    tags: tags.length > 0 ? tags : [],
  };
};

// ─── MAIN APP ───
export default function App() {
  const [clients, setClients] = useState([]);
  const [view, setView] = useState("dashboard");
  const [selectedClient, setSelectedClient] = useState(null);
  const [search, setSearch] = useState("");
  const [filterSegment, setFilterSegment] = useState("All");
  const [filterReferral, setFilterReferral] = useState("All");
  const [filterType, setFilterType] = useState("All");
  const [sortBy, setSortBy] = useState("name");
  const [editingClient, setEditingClient] = useState(null);
  const [importPreview, setImportPreview] = useState([]);
  const [showTouchpointModal, setShowTouchpointModal] = useState(false);
  const [expandedStep, setExpandedStep] = useState(null);
  const [stepNote, setStepNote] = useState("");
  const [notification, setNotification] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dbStatus, setDbStatus] = useState("connecting");
  const fileRef = useRef();

  // Load from Supabase
  useEffect(() => {
    const load = async () => {
      if (!supabase) {
        setDbStatus("no-config");
        setLoading(false);
        return;
      }
      try {
        const { data, error } = await supabase
          .from("past_clients")
          .select("*")
          .order("name");
        if (error) throw error;
        setClients(data || []);
        setDbStatus("connected");
      } catch (err) {
        console.error("Load error:", err);
        setDbStatus("error");
      }
      setLoading(false);
    };
    load();
  }, []);

  const notify = (msg, type = "success") => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 3000);
  };

  // ─── Client CRUD ───
  const addClient = async (client) => {
    if (!supabase) return;
    try {
      const { data, error } = await supabase
        .from("past_clients")
        .insert([client])
        .select();
      if (error) throw error;
      setClients(prev => [...prev, data[0]]);
      notify("Client added!");
    } catch (err) {
      console.error("Add error:", err);
      notify("Failed to add client", "error");
    }
  };

  const updateClient = async (updated) => {
    if (!supabase) return;
    try {
      const { id, created_at, ...rest } = updated;
      rest.updated_at = new Date().toISOString();
      const { data, error } = await supabase
        .from("past_clients")
        .update(rest)
        .eq("id", id)
        .select();
      if (error) throw error;
      const newClient = data[0];
      setClients(prev => prev.map(c => c.id === id ? newClient : c));
      if (selectedClient?.id === id) setSelectedClient(newClient);
      notify("Client updated!");
    } catch (err) {
      console.error("Update error:", err);
      notify("Failed to update", "error");
    }
  };

  const deleteClient = async (id) => {
    if (!supabase) return;
    try {
      const { error } = await supabase
        .from("past_clients")
        .delete()
        .eq("id", id);
      if (error) throw error;
      setClients(prev => prev.filter(c => c.id !== id));
      if (selectedClient?.id === id) { setSelectedClient(null); setView("clients"); }
      notify("Client removed", "info");
    } catch (err) {
      console.error("Delete error:", err);
      notify("Failed to delete", "error");
    }
  };

  const addTouchpoint = async (clientId, tp) => {
    const client = clients.find(c => c.id === clientId);
    if (!client || !supabase) return;
    const newTouchpoints = [...(client.touchpoints || []), {
      ...tp,
      id: Math.random().toString(36).slice(2, 10),
      date: tp.date || new Date().toISOString().split("T")[0]
    }];
    try {
      const { data, error } = await supabase
        .from("past_clients")
        .update({ touchpoints: newTouchpoints, updated_at: new Date().toISOString() })
        .eq("id", clientId)
        .select();
      if (error) throw error;
      const newClient = data[0];
      setClients(prev => prev.map(c => c.id === clientId ? newClient : c));
      if (selectedClient?.id === clientId) setSelectedClient(newClient);
      notify("Touchpoint logged!");
    } catch (err) {
      console.error("Touchpoint error:", err);
      notify("Failed to log touchpoint", "error");
    }
  };

  const updateNurtureStep = async (clientId, stepKey, completed, note) => {
    const client = clients.find(c => c.id === clientId);
    if (!client || !supabase) return;
    const log = { ...(client.nurture_log || {}) };
    if (completed) {
      log[stepKey] = {
        completed: true,
        date: new Date().toISOString().split("T")[0],
        note: note || ""
      };
    } else {
      delete log[stepKey];
    }
    try {
      const { data, error } = await supabase
        .from("past_clients")
        .update({ nurture_log: log, updated_at: new Date().toISOString() })
        .eq("id", clientId)
        .select();
      if (error) throw error;
      const newClient = data[0];
      setClients(prev => prev.map(c => c.id === clientId ? newClient : c));
      if (selectedClient?.id === clientId) setSelectedClient(newClient);
      notify(completed ? "Step completed!" : "Step unmarked");
      setExpandedStep(null);
      setStepNote("");
    } catch (err) {
      console.error("Nurture log error:", err);
      notify("Failed to update step", "error");
    }
  };

  // ─── CSV Import ───
  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const rows = parseCSV(ev.target.result);
      const mapped = rows.map(mapCSVToClient).filter(c => c.name && c.name !== "Unknown");
      setImportPreview(mapped);
      setView("import");
    };
    reader.readAsText(file);
  };

  const confirmImport = async () => {
    if (!supabase) return;
    let imported = [];
    let errors = 0;
    // Insert in batches of 10 to avoid one bad row killing everything
    for (let i = 0; i < importPreview.length; i += 10) {
      const batch = importPreview.slice(i, i + 10);
      try {
        const { data, error } = await supabase
          .from("past_clients")
          .insert(batch)
          .select();
        if (error) {
          // Try one by one if batch fails
          for (const client of batch) {
            try {
              const { data: d2, error: e2 } = await supabase
                .from("past_clients")
                .insert([client])
                .select();
              if (!e2 && d2) imported.push(d2[0]);
              else errors++;
            } catch { errors++; }
          }
        } else if (data) {
          imported.push(...data);
        }
      } catch {
        errors++;
      }
    }
    setClients(prev => [...prev, ...imported]);
    if (imported.length > 0) {
      notify(`${imported.length} clients imported!${errors > 0 ? ` (${errors} skipped)` : ""}`);
    } else {
      notify("Import failed — no clients could be added", "error");
    }
    setImportPreview([]);
    setView(imported.length > 0 ? "clients" : "dashboard");
  };

  // ─── Filtered & Sorted ───
  const filtered = clients.filter(c => {
    if (search && !c.name.toLowerCase().includes(search.toLowerCase()) &&
        !(c.email || "").toLowerCase().includes(search.toLowerCase()) &&
        !(c.address || "").toLowerCase().includes(search.toLowerCase())) return false;
    if (filterSegment !== "All" && !(c.flodesk_segments || []).includes(filterSegment)) return false;
    if (filterReferral !== "All" && c.referral_potential !== parseInt(filterReferral)) return false;
    if (filterType !== "All" && c.transaction_type !== filterType) return false;
    return true;
  }).sort((a, b) => {
    if (sortBy === "name") return (a.name || "").localeCompare(b.name || "");
    if (sortBy === "closeDate") return new Date(b.close_date || 0) - new Date(a.close_date || 0);
    if (sortBy === "referral") return (b.referral_potential || 0) - (a.referral_potential || 0);
    if (sortBy === "anniversary") return daysUntilAnniversary(a.close_date) - daysUntilAnniversary(b.close_date);
    if (sortBy === "lastTouch") {
      const aLast = a.touchpoints?.length ? new Date(a.touchpoints[a.touchpoints.length - 1].date) : new Date(0);
      const bLast = b.touchpoints?.length ? new Date(b.touchpoints[b.touchpoints.length - 1].date) : new Date(0);
      return bLast - aLast;
    }
    return 0;
  });

  // ─── Dashboard Stats ───
  const stats = {
    total: clients.length,
    needsAttention: clients.filter(c => {
      const last = c.touchpoints?.length ? daysSince(c.touchpoints[c.touchpoints.length - 1].date) : 999;
      return last > 60;
    }).length,
    upcomingAnniversaries: clients.filter(c => daysUntilAnniversary(c.close_date) <= 30).length,
    vipClients: clients.filter(c => (c.referral_potential || 0) >= 3).length,
    thisMonthTouchpoints: clients.reduce((sum, c) => {
      const now = new Date();
      return sum + (c.touchpoints || []).filter(t => {
        const d = new Date(t.date);
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      }).length;
    }, 0),
  };

  const needsAttentionList = clients
    .map(c => ({
      ...c,
      daysSinceLast: c.touchpoints?.length
        ? daysSince(c.touchpoints[c.touchpoints.length - 1].date)
        : daysSince(c.close_date) || 999
    }))
    .filter(c => c.daysSinceLast > 45)
    .sort((a, b) => b.daysSinceLast - a.daysSinceLast)
    .slice(0, 8);

  const upcomingAnniversaries = clients
    .filter(c => c.close_date && daysUntilAnniversary(c.close_date) <= 45)
    .sort((a, b) => daysUntilAnniversary(a.close_date) - daysUntilAnniversary(b.close_date))
    .slice(0, 6);

  const fonts = `@import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&family=Playfair+Display:wght@600;700&display=swap');`;

  if (loading) {
    return (
      <div style={{ fontFamily: "'DM Sans', sans-serif", background: "#0c0f14", color: "#e8e6e1", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <style>{fonts}</style>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 36, marginBottom: 16, animation: "pulse 1.5s infinite" }}>🏡</div>
          <p style={{ color: "#6b7280" }}>Loading your clients...</p>
        </div>
      </div>
    );
  }

  if (dbStatus === "no-config") {
    return (
      <div style={{ fontFamily: "'DM Sans', sans-serif", background: "#0c0f14", color: "#e8e6e1", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <style>{fonts}</style>
        <div style={{ textAlign: "center", maxWidth: 500, padding: 40 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>⚙️</div>
          <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 24, color: "#d4a853", marginBottom: 12 }}>Supabase Not Connected</h2>
          <p style={{ color: "#6b7280", lineHeight: 1.6 }}>
            Add your Supabase credentials as environment variables in Vercel:<br/>
            <code style={{ background: "#1e2330", padding: "2px 8px", borderRadius: 4, fontSize: 13 }}>VITE_SUPABASE_URL</code> and <code style={{ background: "#1e2330", padding: "2px 8px", borderRadius: 4, fontSize: 13 }}>VITE_SUPABASE_KEY</code>
          </p>
        </div>
      </div>
    );
  }

  if (dbStatus === "error") {
    return (
      <div style={{ fontFamily: "'DM Sans', sans-serif", background: "#0c0f14", color: "#e8e6e1", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <style>{fonts}</style>
        <div style={{ textAlign: "center", maxWidth: 500, padding: 40 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>❌</div>
          <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 24, color: "#ef4444", marginBottom: 12 }}>Connection Error</h2>
          <p style={{ color: "#6b7280", lineHeight: 1.6 }}>
            Could not connect to Supabase. Check your environment variables and make sure the past_clients table exists.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif", background: "#0c0f14", color: "#e8e6e1", minHeight: "100vh", position: "relative" }}>
      <style>{fonts}{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        input, select, textarea, button { font-family: inherit; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #2a2f3a; border-radius: 3px; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes slideIn { from { opacity: 0; transform: translateX(-12px); } to { opacity: 1; transform: translateX(0); } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: .6; } }
        .fade-in { animation: fadeIn .4s ease both; }
        .slide-in { animation: slideIn .35s ease both; }
      `}</style>

      {notification && (
        <div style={{
          position: "fixed", top: 20, right: 20, zIndex: 999,
          background: notification.type === "success" ? "#166534" : notification.type === "error" ? "#7f1d1d" : "#1e3a5f",
          color: "#fff", padding: "12px 20px", borderRadius: 10, fontSize: 14,
          fontWeight: 500, animation: "fadeIn .3s ease",
          boxShadow: "0 8px 30px rgba(0,0,0,.4)"
        }}>
          {notification.msg}
        </div>
      )}

      {/* Header */}
      <div style={{
        background: "linear-gradient(135deg, #0c0f14 0%, #151a24 100%)",
        borderBottom: "1px solid #1e2330", padding: "16px 24px",
        display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10,
            background: "linear-gradient(135deg, #d4a853, #b8912a)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 18, fontWeight: 700, color: "#0c0f14"
          }}>H</div>
          <div>
            <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: 20, fontWeight: 700, color: "#d4a853", letterSpacing: "0.5px" }}>
              Client Nurture
            </h1>
            <p style={{ fontSize: 11, color: "#6b7280", marginTop: 1 }}>
              Past Client Relationship Manager
              <span style={{ marginLeft: 8, fontSize: 10, color: "#22c55e" }}>● Connected</span>
            </p>
          </div>
        </div>
        <nav style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {[
            { key: "dashboard", label: "Dashboard", icon: "\u25C9" },
            { key: "clients", label: "Clients", icon: "\u25CE" },
            { key: "add", label: "Add Client", icon: "\uFF0B" },
          ].map(tab => (
            <button key={tab.key} onClick={() => { setView(tab.key); setSelectedClient(null); setEditingClient(null); }}
              style={{
                padding: "8px 16px", borderRadius: 8, border: "none", cursor: "pointer",
                fontSize: 13, fontWeight: view === tab.key ? 600 : 400,
                background: view === tab.key ? "rgba(212,168,83,.15)" : "transparent",
                color: view === tab.key ? "#d4a853" : "#6b7280",
                transition: "all .2s"
              }}>
              <span style={{ marginRight: 5, fontSize: 10 }}>{tab.icon}</span>{tab.label}
            </button>
          ))}
          <button onClick={() => fileRef.current?.click()}
            style={{
              padding: "8px 16px", borderRadius: 8, border: "1px dashed #2a2f3a",
              cursor: "pointer", fontSize: 13, fontWeight: 400,
              background: "transparent", color: "#6b7280", transition: "all .2s"
            }}>
            📄 Import CSV
          </button>
          <input ref={fileRef} type="file" accept=".csv" onChange={handleFileUpload} style={{ display: "none" }} />
        </nav>
      </div>

      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "24px 20px" }}>

        {/* ═══════ DASHBOARD ═══════ */}
        {view === "dashboard" && (
          <div className="fade-in">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14, marginBottom: 28 }}>
              {[
                { label: "Total Clients", val: stats.total, color: "#d4a853", icon: "👥" },
                { label: "Needs Attention", val: stats.needsAttention, color: stats.needsAttention > 0 ? "#ef4444" : "#22c55e", icon: "⚠️" },
                { label: "Upcoming Anniversaries", val: stats.upcomingAnniversaries, color: "#8b5cf6", icon: "🎂" },
                { label: "VIP / High Referral", val: stats.vipClients, color: "#22c55e", icon: "⭐" },
                { label: "Touches This Month", val: stats.thisMonthTouchpoints, color: "#3b82f6", icon: "📬" },
              ].map((s, i) => (
                <div key={i} style={{
                  background: "#13161d", border: "1px solid #1e2330", borderRadius: 14,
                  padding: "18px 20px", animation: `fadeIn .4s ease ${i * .07}s both`
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <span style={{ fontSize: 11, color: "#6b7280", textTransform: "uppercase", letterSpacing: 1 }}>{s.label}</span>
                    <span style={{ fontSize: 18 }}>{s.icon}</span>
                  </div>
                  <div style={{ fontSize: 32, fontWeight: 700, color: s.color, fontFamily: "'Playfair Display', serif" }}>{s.val}</div>
                </div>
              ))}
            </div>

            {clients.length === 0 ? (
              <div style={{ textAlign: "center", padding: "60px 20px", color: "#6b7280" }}>
                <p style={{ fontSize: 48, marginBottom: 16 }}>🏡</p>
                <p style={{ fontSize: 18, fontWeight: 500, marginBottom: 8 }}>No past clients yet</p>
                <p style={{ fontSize: 14, marginBottom: 20 }}>Import your Lofty CSV or add clients manually to get started.</p>
                <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
                  <button onClick={() => fileRef.current?.click()} style={{
                    padding: "12px 24px", borderRadius: 10, border: "none", cursor: "pointer",
                    background: "linear-gradient(135deg, #d4a853, #b8912a)", color: "#0c0f14",
                    fontWeight: 600, fontSize: 14
                  }}>Import CSV</button>
                  <button onClick={() => setView("add")} style={{
                    padding: "12px 24px", borderRadius: 10, border: "1px solid #2a2f3a",
                    cursor: "pointer", background: "transparent", color: "#e8e6e1",
                    fontWeight: 500, fontSize: 14
                  }}>Add Manually</button>
                </div>
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
                {/* Needs Attention */}
                <div style={{ background: "#13161d", border: "1px solid #1e2330", borderRadius: 14, padding: 20 }}>
                  <h3 style={{ fontSize: 14, fontWeight: 600, color: "#ef4444", marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
                    <span>⚠️</span> Needs Attention
                  </h3>
                  {needsAttentionList.length === 0 ? (
                    <p style={{ color: "#4b5563", fontSize: 13, fontStyle: "italic" }}>Everyone's been contacted recently — nice work! 🎉</p>
                  ) : needsAttentionList.map((c, i) => (
                    <div key={c.id} onClick={() => { setSelectedClient(c); setView("client-detail"); }}
                      className="slide-in" style={{
                        display: "flex", justifyContent: "space-between", alignItems: "center",
                        padding: "10px 12px", borderRadius: 8, marginBottom: 4, cursor: "pointer",
                        background: "rgba(239,68,68,.05)", animationDelay: `${i * .05}s`,
                        transition: "background .2s"
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = "rgba(239,68,68,.12)"}
                      onMouseLeave={e => e.currentTarget.style.background = "rgba(239,68,68,.05)"}>
                      <span style={{ fontSize: 13, fontWeight: 500 }}>{c.name}</span>
                      <span style={{ fontSize: 11, color: "#ef4444", fontWeight: 600 }}>{c.daysSinceLast}d ago</span>
                    </div>
                  ))}
                </div>

                {/* Upcoming Anniversaries */}
                <div style={{ background: "#13161d", border: "1px solid #1e2330", borderRadius: 14, padding: 20 }}>
                  <h3 style={{ fontSize: 14, fontWeight: 600, color: "#8b5cf6", marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
                    <span>🎂</span> Upcoming Anniversaries
                  </h3>
                  {upcomingAnniversaries.length === 0 ? (
                    <p style={{ color: "#4b5563", fontSize: 13, fontStyle: "italic" }}>No anniversaries in the next 45 days.</p>
                  ) : upcomingAnniversaries.map((c, i) => {
                    const d = daysUntilAnniversary(c.close_date);
                    const years = new Date().getFullYear() - new Date(c.close_date).getFullYear();
                    return (
                      <div key={c.id} onClick={() => { setSelectedClient(c); setView("client-detail"); }}
                        className="slide-in" style={{
                          display: "flex", justifyContent: "space-between", alignItems: "center",
                          padding: "10px 12px", borderRadius: 8, marginBottom: 4, cursor: "pointer",
                          background: "rgba(139,92,246,.05)", animationDelay: `${i * .05}s`,
                          transition: "background .2s"
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = "rgba(139,92,246,.12)"}
                        onMouseLeave={e => e.currentTarget.style.background = "rgba(139,92,246,.05)"}>
                        <div>
                          <span style={{ fontSize: 13, fontWeight: 500 }}>{c.name}</span>
                          <span style={{ fontSize: 11, color: "#6b7280", marginLeft: 8 }}>Year {years}</span>
                        </div>
                        <span style={{ fontSize: 11, color: d <= 7 ? "#f59e0b" : "#8b5cf6", fontWeight: 600 }}>
                          {d === 0 ? "Today!" : `in ${d}d`}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {/* Nurture Pipeline Overview */}
                <div style={{ gridColumn: "1 / -1", background: "#13161d", border: "1px solid #1e2330", borderRadius: 14, padding: 20 }}>
                  <h3 style={{ fontSize: 14, fontWeight: 600, color: "#3b82f6", marginBottom: 4 }}>🔑 Buyer Nurture Pipeline</h3>
                  <p style={{ fontSize: 11, color: "#4b5563", marginBottom: 12 }}>{clients.filter(c => c.transaction_type !== "Seller").length} clients</p>
                  <div style={{ display: "grid", gridTemplateColumns: `repeat(${BUYER_STAGES.length}, 1fr)`, gap: 6, marginBottom: 20 }}>
                    {BUYER_STAGES.map((stage, si) => {
                      const count = clients.filter(c => c.transaction_type !== "Seller" && getStageIndex(c.close_date, c.transaction_type) === si).length;
                      return (
                        <div key={stage.key} style={{
                          textAlign: "center", padding: "12px 6px", borderRadius: 10,
                          background: count > 0 ? "rgba(59,130,246,.08)" : "rgba(255,255,255,.02)",
                          border: `1px solid ${count > 0 ? "rgba(59,130,246,.2)" : "#1e2330"}`
                        }}>
                          <div style={{ fontSize: 18, marginBottom: 2 }}>{stage.icon}</div>
                          <div style={{ fontSize: 20, fontWeight: 700, color: count > 0 ? "#3b82f6" : "#374151", fontFamily: "'Playfair Display', serif" }}>{count}</div>
                          <div style={{ fontSize: 9, color: "#6b7280", marginTop: 2 }}>{stage.label}</div>
                        </div>
                      );
                    })}
                  </div>

                  <h3 style={{ fontSize: 14, fontWeight: 600, color: "#f59e0b", marginBottom: 4 }}>🏠 Seller Nurture Pipeline</h3>
                  <p style={{ fontSize: 11, color: "#4b5563", marginBottom: 12 }}>{clients.filter(c => c.transaction_type === "Seller").length} clients</p>
                  <div style={{ display: "grid", gridTemplateColumns: `repeat(${SELLER_STAGES.length}, 1fr)`, gap: 6 }}>
                    {SELLER_STAGES.map((stage, si) => {
                      const count = clients.filter(c => c.transaction_type === "Seller" && getStageIndex(c.close_date, c.transaction_type) === si).length;
                      return (
                        <div key={stage.key} style={{
                          textAlign: "center", padding: "12px 6px", borderRadius: 10,
                          background: count > 0 ? "rgba(245,158,11,.08)" : "rgba(255,255,255,.02)",
                          border: `1px solid ${count > 0 ? "rgba(245,158,11,.2)" : "#1e2330"}`
                        }}>
                          <div style={{ fontSize: 18, marginBottom: 2 }}>{stage.icon}</div>
                          <div style={{ fontSize: 20, fontWeight: 700, color: count > 0 ? "#f59e0b" : "#374151", fontFamily: "'Playfair Display', serif" }}>{count}</div>
                          <div style={{ fontSize: 9, color: "#6b7280", marginTop: 2 }}>{stage.label}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ═══════ CLIENTS LIST ═══════ */}
        {view === "clients" && (
          <div className="fade-in">
            <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap", alignItems: "center" }}>
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search clients..."
                style={{
                  flex: 1, minWidth: 200, padding: "10px 14px", borderRadius: 10,
                  border: "1px solid #1e2330", background: "#13161d", color: "#e8e6e1",
                  fontSize: 13, outline: "none"
                }} />
              <select value={filterSegment} onChange={e => setFilterSegment(e.target.value)}
                style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid #1e2330", background: "#13161d", color: "#e8e6e1", fontSize: 13 }}>
                <option value="All">All Segments</option>
                {FLODESK_SEGMENTS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <select value={filterType} onChange={e => setFilterType(e.target.value)}
                style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid #1e2330", background: "#13161d", color: "#e8e6e1", fontSize: 13 }}>
                <option value="All">All Types</option>
                {TRANSACTION_TYPES.map(t => <option key={t.value} value={t.value}>{t.icon} {t.label}</option>)}
              </select>
              <select value={filterReferral} onChange={e => setFilterReferral(e.target.value)}
                style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid #1e2330", background: "#13161d", color: "#e8e6e1", fontSize: 13 }}>
                <option value="All">All Referral</option>
                {REFERRAL_LEVELS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
              <select value={sortBy} onChange={e => setSortBy(e.target.value)}
                style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid #1e2330", background: "#13161d", color: "#e8e6e1", fontSize: 13 }}>
                <option value="name">Sort: Name</option>
                <option value="closeDate">Sort: Close Date</option>
                <option value="referral">Sort: Referral Potential</option>
                <option value="anniversary">Sort: Next Anniversary</option>
                <option value="lastTouch">Sort: Last Touched</option>
              </select>
            </div>

            <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 12 }}>{filtered.length} client{filtered.length !== 1 ? "s" : ""}</div>

            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {filtered.map((c, i) => {
                const stage = getCurrentStage(c.close_date, c.transaction_type);
                const lastTouch = c.touchpoints?.length ? c.touchpoints[c.touchpoints.length - 1] : null;
                const refLevel = REFERRAL_LEVELS.find(r => r.value === c.referral_potential);
                const txType = TRANSACTION_TYPES.find(t => t.value === c.transaction_type) || TRANSACTION_TYPES[0];
                return (
                  <div key={c.id} onClick={() => { setSelectedClient(c); setView("client-detail"); }}
                    className="slide-in" style={{
                      background: "#13161d", border: "1px solid #1e2330", borderRadius: 12,
                      padding: "14px 18px", cursor: "pointer", display: "grid",
                      gridTemplateColumns: "1fr auto auto auto auto", gap: 16, alignItems: "center",
                      transition: "all .2s", animationDelay: `${i * .03}s`
                    }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = "#d4a853"; e.currentTarget.style.background = "#161a23"; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = "#1e2330"; e.currentTarget.style.background = "#13161d"; }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 2 }}>{c.name}</div>
                      <div style={{ fontSize: 11, color: "#6b7280" }}>
                        {c.address ? c.address.substring(0, 50) : "No address"} · Closed {formatDate(c.close_date)}
                      </div>
                    </div>
                    <div style={{ textAlign: "center" }}>
                      <div style={{
                        fontSize: 11, fontWeight: 600, color: txType.color,
                        background: txType.color + "18", padding: "3px 10px", borderRadius: 12,
                        border: `1px solid ${txType.color}30`
                      }}>{txType.icon} {txType.label}</div>
                    </div>
                    <div style={{ textAlign: "center" }}>
                      <span style={{ fontSize: 16 }}>{stage.icon}</span>
                      <div style={{ fontSize: 10, color: "#6b7280" }}>{stage.label}</div>
                    </div>
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: refLevel?.color }}>{refLevel?.label}</div>
                      <div style={{ fontSize: 10, color: "#6b7280" }}>Referral</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 11, color: lastTouch ? "#9ca3af" : "#ef4444" }}>
                        {lastTouch ? `${daysSince(lastTouch.date)}d ago` : "Never"}
                      </div>
                      <div style={{ fontSize: 10, color: "#6b7280" }}>Last touch</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ═══════ CLIENT DETAIL ═══════ */}
        {view === "client-detail" && selectedClient && (() => {
          const c = clients.find(x => x.id === selectedClient.id) || selectedClient;
          const stages = getStagesForType(c.transaction_type);
          const stage = getCurrentStage(c.close_date, c.transaction_type);
          const stageIdx = getStageIndex(c.close_date, c.transaction_type);
          const refLevel = REFERRAL_LEVELS.find(r => r.value === c.referral_potential);
          const annDays = daysUntilAnniversary(c.close_date);
          return (
            <div className="fade-in">
              <button onClick={() => { setView("clients"); setSelectedClient(null); setExpandedStep(null); }}
                style={{ background: "none", border: "none", color: "#6b7280", cursor: "pointer", fontSize: 13, marginBottom: 16 }}>
                ← Back to Clients
              </button>

              <div style={{
                background: "#13161d", border: "1px solid #1e2330", borderRadius: 16,
                padding: 24, marginBottom: 16, display: "flex", justifyContent: "space-between",
                alignItems: "flex-start", flexWrap: "wrap", gap: 16
              }}>
                <div style={{ flex: 1 }}>
                  <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 26, fontWeight: 700, color: "#d4a853", marginBottom: 6 }}>{c.name}</h2>
                  <div style={{ fontSize: 13, color: "#9ca3af", marginBottom: 4 }}>{c.address || "No address"}</div>
                  <div style={{ display: "flex", gap: 16, fontSize: 12, color: "#6b7280", flexWrap: "wrap" }}>
                    {c.email && <span>✉️ {c.email}</span>}
                    {c.phone && <span>📞 {c.phone}</span>}
                    {c.purchase_price && <span>💰 ${Number(c.purchase_price).toLocaleString()}</span>}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button onClick={() => setShowTouchpointModal(true)}
                    style={{
                      padding: "10px 18px", borderRadius: 10, border: "none", cursor: "pointer",
                      background: "linear-gradient(135deg, #d4a853, #b8912a)", color: "#0c0f14",
                      fontWeight: 600, fontSize: 13
                    }}>+ Log Touchpoint</button>
                  <button onClick={() => { setEditingClient({...c}); setView("add"); }}
                    style={{
                      padding: "10px 18px", borderRadius: 10, border: "1px solid #2a2f3a",
                      cursor: "pointer", background: "transparent", color: "#e8e6e1",
                      fontWeight: 500, fontSize: 13
                    }}>Edit</button>
                  <button onClick={() => { if(confirm("Delete this client?")) deleteClient(c.id); }}
                    style={{
                      padding: "10px 18px", borderRadius: 10, border: "1px solid #3b1c1c",
                      cursor: "pointer", background: "transparent", color: "#ef4444",
                      fontWeight: 500, fontSize: 13
                    }}>Delete</button>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div style={{ background: "#13161d", border: "1px solid #1e2330", borderRadius: 14, padding: 20 }}>
                  <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 4, color: "#d4a853" }}>
                    {c.transaction_type === "Seller" ? "🏠 Seller" : "🔑 Buyer"} Nurture Timeline
                  </h3>
                  <p style={{ fontSize: 11, color: "#4b5563", marginBottom: 14 }}>
                    {Object.keys(c.nurture_log || {}).filter(k => (c.nurture_log || {})[k]?.completed).length} of {stages.length} completed — click a step to manage
                  </p>
                  {stages.map((s, i) => {
                    const logEntry = (c.nurture_log || {})[s.key];
                    const isCompleted = logEntry?.completed;
                    const isExpanded = expandedStep === s.key;
                    const autoCompleted = !isCompleted && i <= stageIdx;
                    return (
                      <div key={s.key} style={{ marginBottom: 6 }}>
                        <div onClick={() => { setExpandedStep(isExpanded ? null : s.key); setStepNote(logEntry?.note || ""); }}
                          style={{
                            display: "flex", gap: 12, alignItems: "center", padding: "8px 10px",
                            borderRadius: isExpanded ? "10px 10px 0 0" : 10, cursor: "pointer",
                            background: isExpanded ? "rgba(212,168,83,.08)" : "transparent",
                            transition: "background .2s"
                          }}
                          onMouseEnter={e => { if (!isExpanded) e.currentTarget.style.background = "rgba(255,255,255,.03)"; }}
                          onMouseLeave={e => { if (!isExpanded) e.currentTarget.style.background = "transparent"; }}>
                          <div style={{
                            width: 32, height: 32, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
                            background: isCompleted ? "rgba(34,197,94,.15)" : autoCompleted ? "rgba(212,168,83,.1)" : "rgba(255,255,255,.03)",
                            border: `2px solid ${isCompleted ? "#22c55e" : autoCompleted ? "#d4a85380" : "#2a2f3a"}`,
                            fontSize: 14, transition: "all .3s", flexShrink: 0
                          }}>{isCompleted ? "✓" : s.icon}</div>
                          <div style={{ flex: 1 }}>
                            <div style={{
                              fontSize: 13, fontWeight: isCompleted ? 500 : 400,
                              color: isCompleted ? "#22c55e" : autoCompleted ? "#d4a853" : "#6b7280",
                              textDecoration: isCompleted ? "none" : "none"
                            }}>
                              {s.label}
                              {isCompleted && <span style={{ fontSize: 10, color: "#4b5563", marginLeft: 8 }}>{formatDate(logEntry.date)}</span>}
                            </div>
                            <div style={{ fontSize: 11, color: "#4b5563" }}>{s.desc}</div>
                            {isCompleted && logEntry.note && (
                              <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2, fontStyle: "italic" }}>"{logEntry.note}"</div>
                            )}
                          </div>
                          <div style={{ fontSize: 10, color: "#4b5563", flexShrink: 0 }}>Day {s.days === 999 ? "365+" : s.days}</div>
                          <div style={{ fontSize: 12, color: "#4b5563", flexShrink: 0 }}>{isExpanded ? "▲" : "▼"}</div>
                        </div>

                        {isExpanded && (
                          <div style={{
                            padding: "12px 14px", background: "rgba(212,168,83,.05)",
                            borderRadius: "0 0 10px 10px", border: "1px solid rgba(212,168,83,.1)",
                            borderTop: "none", animation: "fadeIn .2s ease"
                          }}>
                            <textarea value={stepNote} onChange={e => setStepNote(e.target.value)}
                              placeholder="Add a note... (what did you say? how did they respond?)"
                              style={{
                                width: "100%", minHeight: 60, padding: 10, borderRadius: 8,
                                border: "1px solid #1e2330", background: "#0c0f14", color: "#e8e6e1",
                                fontSize: 12, resize: "vertical", outline: "none", marginBottom: 8
                              }} />
                            <div style={{ display: "flex", gap: 8 }}>
                              {!isCompleted ? (
                                <button onClick={() => updateNurtureStep(c.id, s.key, true, stepNote)}
                                  style={{
                                    padding: "8px 16px", borderRadius: 8, border: "none", cursor: "pointer",
                                    background: "#22c55e", color: "#fff", fontWeight: 600, fontSize: 12
                                  }}>✓ Mark Complete</button>
                              ) : (
                                <button onClick={() => updateNurtureStep(c.id, s.key, false)}
                                  style={{
                                    padding: "8px 16px", borderRadius: 8, border: "1px solid #2a2f3a",
                                    cursor: "pointer", background: "transparent", color: "#9ca3af",
                                    fontWeight: 500, fontSize: 12
                                  }}>Undo Complete</button>
                              )}
                              {isCompleted && stepNote !== (logEntry?.note || "") && (
                                <button onClick={() => updateNurtureStep(c.id, s.key, true, stepNote)}
                                  style={{
                                    padding: "8px 16px", borderRadius: 8, border: "none", cursor: "pointer",
                                    background: "#d4a853", color: "#0c0f14", fontWeight: 600, fontSize: 12
                                  }}>Update Note</button>
                              )}
                              <button onClick={() => { setExpandedStep(null); setStepNote(""); }}
                                style={{
                                  padding: "8px 16px", borderRadius: 8, border: "1px solid #2a2f3a",
                                  cursor: "pointer", background: "transparent", color: "#6b7280",
                                  fontSize: 12
                                }}>Close</button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  <div style={{ background: "#13161d", border: "1px solid #1e2330", borderRadius: 14, padding: 20 }}>
                    <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: "#d4a853" }}>Status</h3>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                      <div>
                        <div style={{ fontSize: 10, color: "#6b7280", textTransform: "uppercase", letterSpacing: 1 }}>Transaction Type</div>
                        <div style={{ marginTop: 4, display: "flex", gap: 4 }}>
                          {TRANSACTION_TYPES.map(t => (
                            <button key={t.value} onClick={() => updateClient({ ...c, transaction_type: t.value })}
                              style={{
                                padding: "4px 10px", borderRadius: 8, fontSize: 11, fontWeight: 600, cursor: "pointer",
                                border: `1px solid ${c.transaction_type === t.value ? t.color : "#2a2f3a"}`,
                                background: c.transaction_type === t.value ? t.color + "20" : "transparent",
                                color: c.transaction_type === t.value ? t.color : "#4b5563",
                              }}>{t.icon} {t.label}</button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: 10, color: "#6b7280", textTransform: "uppercase", letterSpacing: 1 }}>Referral Potential</div>
                        <div style={{ fontSize: 16, fontWeight: 700, color: refLevel?.color, marginTop: 4 }}>{refLevel?.label}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 10, color: "#6b7280", textTransform: "uppercase", letterSpacing: 1 }}>Anniversary</div>
                        <div style={{ fontSize: 16, fontWeight: 700, color: annDays <= 30 ? "#f59e0b" : "#9ca3af", marginTop: 4 }}>
                          {annDays === 0 ? "Today!" : `${annDays} days`}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: 10, color: "#6b7280", textTransform: "uppercase", letterSpacing: 1 }}>Current Stage</div>
                        <div style={{ fontSize: 14, fontWeight: 500, marginTop: 4 }}>{stage.icon} {stage.label}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 10, color: "#6b7280", textTransform: "uppercase", letterSpacing: 1 }}>Touchpoints</div>
                        <div style={{ fontSize: 16, fontWeight: 700, color: "#3b82f6", marginTop: 4 }}>{(c.touchpoints || []).length}</div>
                      </div>
                    </div>
                  </div>

                  <div style={{ background: "#13161d", border: "1px solid #1e2330", borderRadius: 14, padding: 20 }}>
                    <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: "#d4a853" }}>Flodesk Segments</h3>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {FLODESK_SEGMENTS.map(seg => {
                        const active = (c.flodesk_segments || []).includes(seg);
                        return (
                          <button key={seg} onClick={() => {
                            const segs = active
                              ? (c.flodesk_segments || []).filter(s => s !== seg)
                              : [...(c.flodesk_segments || []), seg];
                            updateClient({ ...c, flodesk_segments: segs });
                          }}
                            style={{
                              padding: "6px 12px", borderRadius: 20, fontSize: 11, fontWeight: 500,
                              border: `1px solid ${active ? "#d4a853" : "#2a2f3a"}`,
                              background: active ? "rgba(212,168,83,.15)" : "transparent",
                              color: active ? "#d4a853" : "#6b7280", cursor: "pointer",
                              transition: "all .2s"
                            }}>{seg}</button>
                        );
                      })}
                    </div>
                  </div>

                  <div style={{ background: "#13161d", border: "1px solid #1e2330", borderRadius: 14, padding: 20 }}>
                    <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8, color: "#d4a853" }}>Notes</h3>
                    <textarea value={c.notes || ""} onChange={e => updateClient({...c, notes: e.target.value})}
                      placeholder="Kids' names, pets, hobbies, referral details..."
                      style={{
                        width: "100%", minHeight: 80, padding: 10, borderRadius: 8,
                        border: "1px solid #1e2330", background: "#0c0f14", color: "#e8e6e1",
                        fontSize: 13, resize: "vertical", outline: "none"
                      }} />
                  </div>
                </div>

                <div style={{ gridColumn: "1 / -1", background: "#13161d", border: "1px solid #1e2330", borderRadius: 14, padding: 20 }}>
                  <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 14, color: "#d4a853" }}>Touchpoint History</h3>
                  {(c.touchpoints || []).length === 0 ? (
                    <p style={{ color: "#4b5563", fontSize: 13, fontStyle: "italic" }}>No touchpoints logged yet. Start building that relationship!</p>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {[...(c.touchpoints || [])].reverse().map((tp, tpi) => {
                        const tpType = TOUCHPOINT_TYPES.find(t => t.key === tp.type);
                        return (
                          <div key={tp.id || tpi} style={{
                            display: "flex", alignItems: "center", gap: 12, padding: "10px 12px",
                            borderRadius: 8, background: "rgba(255,255,255,.02)"
                          }}>
                            <span style={{ fontSize: 18 }}>{tpType?.icon || "📋"}</span>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: 13, fontWeight: 500 }}>{tp.note || tpType?.label}</div>
                              <div style={{ fontSize: 11, color: "#6b7280" }}>{formatDate(tp.date)}</div>
                            </div>
                            <span style={{ fontSize: 11, color: "#4b5563", background: "rgba(255,255,255,.05)", padding: "3px 10px", borderRadius: 12 }}>
                              {tpType?.label}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {showTouchpointModal && <TouchpointModal
                onSave={(tp) => { addTouchpoint(c.id, tp); setShowTouchpointModal(false); }}
                onClose={() => setShowTouchpointModal(false)}
              />}
            </div>
          );
        })()}

        {/* ═══════ ADD / EDIT CLIENT ═══════ */}
        {view === "add" && <ClientForm
          initial={editingClient}
          onSave={(data) => {
            if (editingClient) {
              updateClient({ ...editingClient, ...data });
              setEditingClient(null);
            } else {
              addClient(data);
            }
            setView("clients");
          }}
          onCancel={() => { setEditingClient(null); setView("dashboard"); }}
        />}

        {/* ═══════ IMPORT PREVIEW ═══════ */}
        {view === "import" && (
          <div className="fade-in">
            <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 22, fontWeight: 700, color: "#d4a853", marginBottom: 8 }}>
              Import Preview
            </h2>
            <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 20 }}>
              {importPreview.length} clients found in your CSV. Review and confirm import.
            </p>
            <div style={{ maxHeight: 400, overflow: "auto", marginBottom: 20 }}>
              {importPreview.map((c, i) => (
                <div key={i} style={{
                  display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto",
                  gap: 12, padding: "10px 14px", borderRadius: 8,
                  background: i % 2 === 0 ? "rgba(255,255,255,.02)" : "transparent",
                  fontSize: 13, alignItems: "center"
                }}>
                  <span style={{ fontWeight: 500 }}>{c.name}</span>
                  <span style={{ color: "#6b7280" }}>{c.email || "\u2014"}</span>
                  <span style={{ color: "#6b7280" }}>{c.phone || "\u2014"}</span>
                  <span style={{ color: "#4b5563", fontSize: 11 }}>{c.close_date ? formatDate(c.close_date) : "No close date"}</span>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 12 }}>
              <button onClick={confirmImport} style={{
                padding: "12px 28px", borderRadius: 10, border: "none", cursor: "pointer",
                background: "linear-gradient(135deg, #d4a853, #b8912a)", color: "#0c0f14",
                fontWeight: 600, fontSize: 14
              }}>Import {importPreview.length} Clients</button>
              <button onClick={() => { setImportPreview([]); setView("dashboard"); }} style={{
                padding: "12px 28px", borderRadius: 10, border: "1px solid #2a2f3a",
                cursor: "pointer", background: "transparent", color: "#e8e6e1", fontSize: 14
              }}>Cancel</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── CLIENT FORM ───
function ClientForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState(initial ? {
    name: initial.name || "",
    email: initial.email || "",
    phone: initial.phone || "",
    address: initial.address || "",
    close_date: initial.close_date || "",
    purchase_price: initial.purchase_price || "",
    property_type: initial.property_type || "Single Family",
    transaction_type: initial.transaction_type || "Buyer",
    referral_potential: initial.referral_potential || 2,
    flodesk_segments: initial.flodesk_segments || ["Past Clients"],
    notes: initial.notes || "",
    tags: initial.tags || [],
    source: initial.source || "Manual",
    touchpoints: initial.touchpoints || [],
  } : { ...DEFAULT_CLIENT });
  const up = (field, val) => setForm(prev => ({ ...prev, [field]: val }));

  const inputStyle = {
    width: "100%", padding: "10px 14px", borderRadius: 10,
    border: "1px solid #1e2330", background: "#0c0f14", color: "#e8e6e1",
    fontSize: 13, outline: "none"
  };
  const labelStyle = { fontSize: 11, color: "#6b7280", marginBottom: 4, display: "block", textTransform: "uppercase", letterSpacing: 1 };

  return (
    <div className="fade-in" style={{ maxWidth: 700 }}>
      <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 22, fontWeight: 700, color: "#d4a853", marginBottom: 20 }}>
        {initial ? "Edit Client" : "Add New Client"}
      </h2>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, background: "#13161d", border: "1px solid #1e2330", borderRadius: 14, padding: 24 }}>
        <div style={{ gridColumn: "1 / -1" }}>
          <label style={labelStyle}>Full Name *</label>
          <input value={form.name} onChange={e => up("name", e.target.value)} style={inputStyle} placeholder="Jane Smith" />
        </div>
        <div>
          <label style={labelStyle}>Email</label>
          <input value={form.email} onChange={e => up("email", e.target.value)} style={inputStyle} placeholder="jane@email.com" />
        </div>
        <div>
          <label style={labelStyle}>Phone</label>
          <input value={form.phone} onChange={e => up("phone", e.target.value)} style={inputStyle} placeholder="(386) 555-1234" />
        </div>
        <div style={{ gridColumn: "1 / -1" }}>
          <label style={labelStyle}>Property Address</label>
          <input value={form.address} onChange={e => up("address", e.target.value)} style={inputStyle} placeholder="123 Palm Dr, Port Orange, FL 32129" />
        </div>
        <div>
          <label style={labelStyle}>Close Date</label>
          <input type="date" value={form.close_date} onChange={e => up("close_date", e.target.value)} style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>Purchase Price</label>
          <input value={form.purchase_price} onChange={e => up("purchase_price", e.target.value)} style={inputStyle} placeholder="375000" />
        </div>
        <div>
          <label style={labelStyle}>Property Type</label>
          <select value={form.property_type} onChange={e => up("property_type", e.target.value)} style={inputStyle}>
            {["Single Family", "Condo/Townhome", "Multi-Family", "Land", "Commercial"].map(t => <option key={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Transaction Type</label>
          <select value={form.transaction_type || "Buyer"} onChange={e => up("transaction_type", e.target.value)} style={inputStyle}>
            {TRANSACTION_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Referral Potential</label>
          <select value={form.referral_potential} onChange={e => up("referral_potential", parseInt(e.target.value))} style={inputStyle}>
            {REFERRAL_LEVELS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </div>
        <div style={{ gridColumn: "1 / -1" }}>
          <label style={labelStyle}>Flodesk Segments</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
            {FLODESK_SEGMENTS.map(seg => {
              const active = (form.flodesk_segments || []).includes(seg);
              return (
                <button key={seg} type="button" onClick={() => {
                  const segs = active
                    ? (form.flodesk_segments || []).filter(s => s !== seg)
                    : [...(form.flodesk_segments || []), seg];
                  up("flodesk_segments", segs);
                }}
                  style={{
                    padding: "6px 12px", borderRadius: 20, fontSize: 11, fontWeight: 500,
                    border: `1px solid ${active ? "#d4a853" : "#2a2f3a"}`,
                    background: active ? "rgba(212,168,83,.15)" : "transparent",
                    color: active ? "#d4a853" : "#6b7280", cursor: "pointer"
                  }}>{seg}</button>
              );
            })}
          </div>
        </div>
        <div style={{ gridColumn: "1 / -1" }}>
          <label style={labelStyle}>Notes</label>
          <textarea value={form.notes} onChange={e => up("notes", e.target.value)} style={{ ...inputStyle, minHeight: 80, resize: "vertical" }}
            placeholder="Personal details — kids, pets, hobbies, how they found you..." />
        </div>
        <div style={{ gridColumn: "1 / -1", display: "flex", gap: 12, marginTop: 8 }}>
          <button onClick={() => { if (form.name.trim()) onSave(form); }} style={{
            padding: "12px 28px", borderRadius: 10, border: "none", cursor: "pointer",
            background: "linear-gradient(135deg, #d4a853, #b8912a)", color: "#0c0f14",
            fontWeight: 600, fontSize: 14, opacity: form.name.trim() ? 1 : 0.5
          }}>{initial ? "Save Changes" : "Add Client"}</button>
          <button onClick={onCancel} style={{
            padding: "12px 28px", borderRadius: 10, border: "1px solid #2a2f3a",
            cursor: "pointer", background: "transparent", color: "#e8e6e1", fontSize: 14
          }}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ─── TOUCHPOINT MODAL ───
function TouchpointModal({ onSave, onClose }) {
  const [type, setType] = useState("email");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,.7)", display: "flex",
      alignItems: "center", justifyContent: "center", zIndex: 100
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: "#13161d", border: "1px solid #1e2330", borderRadius: 16,
        padding: 28, width: 420, maxWidth: "90vw", animation: "fadeIn .3s ease"
      }}>
        <h3 style={{ fontFamily: "'Playfair Display', serif", fontSize: 20, fontWeight: 700, color: "#d4a853", marginBottom: 20 }}>
          Log Touchpoint
        </h3>
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 8, textTransform: "uppercase", letterSpacing: 1 }}>Type</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {TOUCHPOINT_TYPES.map(t => (
              <button key={t.key} onClick={() => setType(t.key)} style={{
                padding: "8px 14px", borderRadius: 10, fontSize: 12, fontWeight: 500,
                border: `1px solid ${type === t.key ? "#d4a853" : "#2a2f3a"}`,
                background: type === t.key ? "rgba(212,168,83,.15)" : "transparent",
                color: type === t.key ? "#d4a853" : "#6b7280", cursor: "pointer"
              }}>{t.icon} {t.label}</button>
            ))}
          </div>
        </div>
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 }}>Date</div>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} style={{
            width: "100%", padding: "10px 14px", borderRadius: 10, border: "1px solid #1e2330",
            background: "#0c0f14", color: "#e8e6e1", fontSize: 13, outline: "none"
          }} />
        </div>
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 }}>Note</div>
          <textarea value={note} onChange={e => setNote(e.target.value)}
            placeholder="What did you talk about? Any follow-up needed?"
            style={{
              width: "100%", minHeight: 80, padding: 10, borderRadius: 8,
              border: "1px solid #1e2330", background: "#0c0f14", color: "#e8e6e1",
              fontSize: 13, resize: "vertical", outline: "none"
            }} />
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          <button onClick={() => onSave({ type, note, date })} style={{
            flex: 1, padding: "12px", borderRadius: 10, border: "none", cursor: "pointer",
            background: "linear-gradient(135deg, #d4a853, #b8912a)", color: "#0c0f14",
            fontWeight: 600, fontSize: 14
          }}>Save Touchpoint</button>
          <button onClick={onClose} style={{
            padding: "12px 20px", borderRadius: 10, border: "1px solid #2a2f3a",
            cursor: "pointer", background: "transparent", color: "#e8e6e1", fontSize: 14
          }}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
