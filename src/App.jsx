import { useState, useEffect, useCallback } from "react";

const SUPABASE_URL = "https://oqnwdnflrjxruwlwcniz.supabase.co";
const SUPABASE_KEY = "sb_publishable_2YNVtOzFlJCIcKARaoCmUQ_6anksnkL";

// ─── Supabase helpers ────────────────────────────────────────────────────────
const sb = async (path, options = {}) => {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      "apikey": SUPABASE_KEY,
      "Authorization": `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      "Prefer": options.prefer || "return=representation",
      ...(options.headers || {})
    },
    ...options
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : [];
};

const DB = {
  // Recipes
  getRecipes: () => sb("recipes?order=created_at.asc", { method: "GET" }),
  addRecipe: (r) => sb("recipes", { method: "POST", body: JSON.stringify(r) }),
  deleteRecipe: (id) => sb(`recipes?id=eq.${id}`, { method: "DELETE", prefer: "return=minimal" }),

  // Shopping
  getShopping: () => sb("shopping_list?order=created_at.asc", { method: "GET" }),
  addShoppingItem: (item) => sb("shopping_list", { method: "POST", body: JSON.stringify(item) }),
  addShoppingItems: (items) => sb("shopping_list", { method: "POST", body: JSON.stringify(items) }),
  toggleShoppingItem: (id, checked) => sb(`shopping_list?id=eq.${id}`, { method: "PATCH", body: JSON.stringify({ checked }), prefer: "return=minimal" }),
  deleteShoppingItem: (id) => sb(`shopping_list?id=eq.${id}`, { method: "DELETE", prefer: "return=minimal" }),
  deleteChecked: () => sb(`shopping_list?checked=eq.true`, { method: "DELETE", prefer: "return=minimal" }),

  // Calendar
  getCalendar: () => sb("meal_calendar?order=date.asc", { method: "GET" }),
  setMeal: (entry) => sb("meal_calendar", { method: "POST", body: JSON.stringify(entry), prefer: "resolution=merge-duplicates,return=representation" }),
  deleteMeal: (date, slot) => sb(`meal_calendar?date=eq.${date}&slot=eq.${slot}`, { method: "DELETE", prefer: "return=minimal" }),
};

// Default recipes to seed on first load
const DEFAULT_RECIPES = [
  { name: "Tacos de Pollo", emoji: "🌮", time: "30 min", servings: 4, category: "Mexicana", ingredients: ["500g pechuga de pollo","8 tortillas de maíz","1 cebolla","2 tomates","cilantro","limón","sal y pimienta","aceite"], steps: ["Cortar el pollo en tiras y sazonar.","Calentar aceite y cocinar el pollo.","Picar cebolla, tomate y cilantro.","Calentar tortillas.","Armar los tacos con todos los ingredientes."] },
  { name: "Pasta Carbonara", emoji: "🍝", time: "20 min", servings: 2, category: "Italiana", ingredients: ["200g espagueti","100g panceta","2 huevos","50g queso parmesano","pimienta negra","sal"], steps: ["Cocinar la pasta al dente.","Freír la panceta.","Batir huevos con queso parmesano.","Mezclar pasta caliente con panceta.","Agregar mezcla de huevos fuera del fuego."] },
  { name: "Ensalada César", emoji: "🥗", time: "15 min", servings: 2, category: "Ensaladas", ingredients: ["1 lechuga romana","100g pollo a la plancha","50g queso parmesano","crutones","aderezo César","limón"], steps: ["Lavar y trozar la lechuga.","Grillar el pollo y cortar en tiras.","Mezclar lechuga, pollo y crutones.","Agregar aderezo César al gusto.","Decorar con queso parmesano rallado."] }
];

// ─── Main App ────────────────────────────────────────────────────────────────
export default function App() {
  const [tab, setTab] = useState("recipes");
  const [recipes, setRecipes] = useState([]);
  const [shopping, setShopping] = useState([]);
  const [calendar, setCalendar] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedRecipe, setSelectedRecipe] = useState(null);
  const [toast, setToast] = useState(null);
  const [shareModal, setShareModal] = useState(false);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  // Load all data
  const loadAll = useCallback(async () => {
    try {
      const [r, s, c] = await Promise.all([DB.getRecipes(), DB.getShopping(), DB.getCalendar()]);
      setRecipes(r);
      setShopping(s);
      setCalendar(c);
      // Seed default recipes if empty
      if (r.length === 0) {
        for (const recipe of DEFAULT_RECIPES) {
          await DB.addRecipe(recipe);
        }
        const fresh = await DB.getRecipes();
        setRecipes(fresh);
      }
    } catch (e) {
      showToast("Error conectando a la base de datos");
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  // Poll for updates every 10s (realtime sync)
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const [r, s, c] = await Promise.all([DB.getRecipes(), DB.getShopping(), DB.getCalendar()]);
        setRecipes(r);
        setShopping(s);
        setCalendar(c);
      } catch {}
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  const addToCart = async (ingredients, recipeName) => {
    const existingNames = new Set(shopping.map(i => i.name.toLowerCase()));
    const newItems = ingredients
      .filter(ing => !existingNames.has(ing.toLowerCase()))
      .map(ing => ({ name: ing, checked: false, from_recipe: recipeName }));
    if (newItems.length === 0) { showToast("Todos los ingredientes ya están en el carrito"); return; }
    try {
      await DB.addShoppingItems(newItems);
      const fresh = await DB.getShopping();
      setShopping(fresh);
      showToast(`${newItems.length} ingredientes agregados ✅`);
    } catch { showToast("Error al agregar ingredientes"); }
  };

  const pendingCount = shopping.filter(i => !i.checked).length;

  if (loading) return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100vh", background: "#faf7f2", gap: 16 }}>
      <div style={{ fontSize: 60 }}>🍃</div>
      <div style={{ fontSize: 20, fontWeight: "bold", color: "#2d5016" }}>RecetApp</div>
      <div style={{ fontSize: 14, color: "#999" }}>Conectando...</div>
    </div>
  );

  return (
    <div style={{ fontFamily: "'Georgia', serif", background: "#faf7f2", minHeight: "100vh", maxWidth: 480, margin: "0 auto", position: "relative", paddingBottom: 80 }}>
      {/* Header */}
      <div style={{ background: "linear-gradient(135deg, #2d5016 0%, #4a7c1f 100%)", padding: "20px 20px 16px", color: "white" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 11, letterSpacing: 3, opacity: 0.7, textTransform: "uppercase" }}>Sincronizado en la nube</div>
            <h1 style={{ margin: 0, fontSize: 26, fontWeight: "bold", letterSpacing: -0.5 }}>🍃 RecetApp</h1>
          </div>
          <button onClick={() => setShareModal(true)} style={{ background: "rgba(255,255,255,0.15)", border: "none", borderRadius: 12, padding: "8px 14px", color: "white", cursor: "pointer", fontSize: 13 }}>
            🔗 Compartir
          </button>
        </div>
      </div>

      <div style={{ padding: "0 16px" }}>
        {tab === "recipes" && <RecipesTab recipes={recipes} setRecipes={setRecipes} onSelect={setSelectedRecipe} addToCart={addToCart} showToast={showToast} />}
        {tab === "cart" && <ShoppingTab shopping={shopping} setShopping={setShopping} showToast={showToast} />}
        {tab === "calendar" && <CalendarTab calendar={calendar} setCalendar={setCalendar} recipes={recipes} showToast={showToast} />}
        {tab === "ai" && <AITab recipes={recipes} setRecipes={setRecipes} showToast={showToast} onDone={() => setTab("recipes")} />}
      </div>

      {/* Bottom Nav */}
      <div style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 480, background: "white", borderTop: "1px solid #e8e0d5", display: "flex", padding: "8px 0 12px" }}>
        {[
          { id: "recipes", emoji: "📖", label: "Recetas" },
          { id: "cart", emoji: "🛒", label: pendingCount ? `Compras (${pendingCount})` : "Compras" },
          { id: "calendar", emoji: "📅", label: "Menú" },
          { id: "ai", emoji: "✨", label: "IA Chef" },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{ flex: 1, background: "none", border: "none", cursor: "pointer", padding: "4px 0", display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
            <span style={{ fontSize: 22 }}>{t.emoji}</span>
            <span style={{ fontSize: 10, color: tab === t.id ? "#4a7c1f" : "#999", fontWeight: tab === t.id ? "bold" : "normal" }}>{t.label}</span>
          </button>
        ))}
      </div>

      {selectedRecipe && <RecipeModal recipe={selectedRecipe} onClose={() => setSelectedRecipe(null)} addToCart={addToCart} />}
      {shareModal && <ShareModal onClose={() => setShareModal(false)} />}

      {toast && (
        <div style={{ position: "fixed", bottom: 90, left: "50%", transform: "translateX(-50%)", background: "#2d5016", color: "white", padding: "10px 20px", borderRadius: 20, fontSize: 13, zIndex: 999, whiteSpace: "nowrap", boxShadow: "0 4px 20px rgba(0,0,0,0.2)" }}>
          {toast}
        </div>
      )}
    </div>
  );
}

// ─── Recipes Tab ─────────────────────────────────────────────────────────────
function RecipesTab({ recipes, setRecipes, onSelect, addToCart, showToast }) {
  const [searchQ, setSearchQ] = useState("");
  const [cat, setCat] = useState("Todas");
  const [adding, setAdding] = useState(false);

  const cats = ["Todas", ...new Set(recipes.map(r => r.category).filter(Boolean))];
  const filtered = recipes.filter(r =>
    (cat === "Todas" || r.category === cat) &&
    r.name.toLowerCase().includes(searchQ.toLowerCase())
  );

  const deleteRecipe = async (id) => {
    try {
      await DB.deleteRecipe(id);
      setRecipes(r => r.filter(x => x.id !== id));
      showToast("Receta eliminada");
    } catch { showToast("Error al eliminar"); }
  };

  return (
    <div style={{ paddingTop: 16 }}>
      <div style={{ background: "white", borderRadius: 14, padding: "10px 14px", display: "flex", alignItems: "center", gap: 8, marginBottom: 14, boxShadow: "0 2px 10px rgba(0,0,0,0.06)" }}>
        <span>🔍</span>
        <input value={searchQ} onChange={e => setSearchQ(e.target.value)} placeholder="Buscar recetas..." style={{ border: "none", outline: "none", flex: 1, fontSize: 15, fontFamily: "Georgia, serif" }} />
      </div>

      <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 8, marginBottom: 16 }}>
        {cats.map(c => (
          <button key={c} onClick={() => setCat(c)} style={{ whiteSpace: "nowrap", padding: "6px 14px", borderRadius: 20, border: "none", background: cat === c ? "#4a7c1f" : "white", color: cat === c ? "white" : "#555", fontSize: 13, cursor: "pointer", boxShadow: "0 2px 6px rgba(0,0,0,0.08)" }}>
            {c}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {filtered.map(recipe => (
          <div key={recipe.id} style={{ background: "white", borderRadius: 18, padding: 16, boxShadow: "0 2px 12px rgba(0,0,0,0.07)", cursor: "pointer" }} onClick={() => onSelect(recipe)}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div style={{ display: "flex", gap: 12, flex: 1 }}>
                <span style={{ fontSize: 40 }}>{recipe.emoji}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: "bold", fontSize: 17, color: "#1a1a1a" }}>{recipe.name}</div>
                  <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>{recipe.category}</div>
                  <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
                    <span style={{ fontSize: 12, color: "#666" }}>⏱ {recipe.time}</span>
                    <span style={{ fontSize: 12, color: "#666" }}>👥 {recipe.servings} pers.</span>
                    <span style={{ fontSize: 12, color: "#666" }}>🧺 {(recipe.ingredients||[]).length} ing.</span>
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <button onClick={e => { e.stopPropagation(); addToCart(recipe.ingredients || [], recipe.name); }} style={{ background: "#4a7c1f", color: "white", border: "none", borderRadius: 10, padding: "6px 10px", fontSize: 13, cursor: "pointer" }}>🛒</button>
                <button onClick={e => { e.stopPropagation(); deleteRecipe(recipe.id); }} style={{ background: "#fff0f0", color: "#cc3333", border: "none", borderRadius: 10, padding: "6px 10px", fontSize: 13, cursor: "pointer" }}>🗑</button>
              </div>
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div style={{ textAlign: "center", padding: 40, color: "#aaa" }}>
            <div style={{ fontSize: 40 }}>🍽</div>
            <div>No se encontraron recetas</div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Recipe Modal ─────────────────────────────────────────────────────────────
function RecipeModal({ recipe, onClose, addToCart }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 100, display: "flex", alignItems: "flex-end" }}>
      <div style={{ background: "white", borderRadius: "24px 24px 0 0", width: "100%", maxHeight: "90vh", overflowY: "auto", padding: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ fontSize: 40 }}>{recipe.emoji}</div>
          <button onClick={onClose} style={{ background: "#f5f5f5", border: "none", borderRadius: "50%", width: 36, height: 36, cursor: "pointer", fontSize: 16 }}>✕</button>
        </div>
        <h2 style={{ margin: "0 0 4px", fontSize: 24 }}>{recipe.name}</h2>
        <div style={{ color: "#888", fontSize: 13, marginBottom: 16 }}>{recipe.category}</div>
        <div style={{ display: "flex", gap: 16, marginBottom: 20 }}>
          <div style={{ background: "#f0f7e8", padding: "8px 14px", borderRadius: 12, fontSize: 13 }}>⏱ {recipe.time}</div>
          <div style={{ background: "#f0f7e8", padding: "8px 14px", borderRadius: 12, fontSize: 13 }}>👥 {recipe.servings} personas</div>
        </div>
        <h3 style={{ fontSize: 16, color: "#333", marginBottom: 10 }}>🧺 Ingredientes</h3>
        <div style={{ background: "#faf7f2", borderRadius: 14, padding: 14, marginBottom: 20 }}>
          {(recipe.ingredients || []).map((ing, i) => (
            <div key={i} style={{ padding: "6px 0", borderBottom: i < recipe.ingredients.length-1 ? "1px solid #ece8e0" : "none", fontSize: 14, color: "#444" }}>• {ing}</div>
          ))}
        </div>
        <h3 style={{ fontSize: 16, color: "#333", marginBottom: 10 }}>👩‍🍳 Preparación</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 24 }}>
          {(recipe.steps || []).map((step, i) => (
            <div key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
              <div style={{ background: "#4a7c1f", color: "white", borderRadius: "50%", width: 26, height: 26, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, flexShrink: 0, marginTop: 1 }}>{i+1}</div>
              <div style={{ fontSize: 14, color: "#444", lineHeight: 1.5 }}>{step}</div>
            </div>
          ))}
        </div>
        <button onClick={() => addToCart(recipe.ingredients || [], recipe.name)} style={{ width: "100%", background: "#4a7c1f", color: "white", border: "none", borderRadius: 16, padding: "14px", fontSize: 16, cursor: "pointer", fontFamily: "Georgia, serif" }}>
          🛒 Agregar ingredientes al carrito
        </button>
      </div>
    </div>
  );
}

// ─── Shopping Tab ─────────────────────────────────────────────────────────────
function ShoppingTab({ shopping, setShopping, showToast }) {
  const [newItem, setNewItem] = useState("");

  const toggle = async (item) => {
    try {
      await DB.toggleShoppingItem(item.id, !item.checked);
      setShopping(s => s.map(i => i.id === item.id ? { ...i, checked: !i.checked } : i));
    } catch { showToast("Error al actualizar"); }
  };

  const removeItem = async (id) => {
    try {
      await DB.deleteShoppingItem(id);
      setShopping(s => s.filter(i => i.id !== id));
    } catch { showToast("Error al eliminar"); }
  };

  const clearChecked = async () => {
    try {
      await DB.deleteChecked();
      setShopping(s => s.filter(i => !i.checked));
      showToast("Comprados eliminados ✅");
    } catch { showToast("Error al limpiar"); }
  };

  const addItem = async () => {
    if (!newItem.trim()) return;
    try {
      const added = await DB.addShoppingItem({ name: newItem.trim(), checked: false, from_recipe: "Manual" });
      setShopping(s => [...s, added[0]]);
      setNewItem("");
    } catch { showToast("Error al agregar"); }
  };

  const pending = shopping.filter(i => !i.checked);
  const done = shopping.filter(i => i.checked);
  const byRecipe = {};
  pending.forEach(i => { (byRecipe[i.from_recipe || "Otros"] = byRecipe[i.from_recipe || "Otros"] || []).push(i); });

  return (
    <div style={{ paddingTop: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ fontSize: 18, fontWeight: "bold", color: "#1a1a1a" }}>🛒 Lista de Compras</div>
        {done.length > 0 && (
          <button onClick={clearChecked} style={{ background: "#fff0f0", color: "#cc3333", border: "none", borderRadius: 10, padding: "6px 12px", fontSize: 12, cursor: "pointer" }}>Limpiar comprados</button>
        )}
      </div>

      <div style={{ background: "white", borderRadius: 14, padding: "10px 14px", display: "flex", gap: 10, marginBottom: 20, boxShadow: "0 2px 10px rgba(0,0,0,0.06)" }}>
        <input value={newItem} onChange={e => setNewItem(e.target.value)} onKeyDown={e => e.key === "Enter" && addItem()} placeholder="Agregar artículo..." style={{ border: "none", outline: "none", flex: 1, fontSize: 15, fontFamily: "Georgia, serif" }} />
        <button onClick={addItem} style={{ background: "#4a7c1f", color: "white", border: "none", borderRadius: 10, padding: "6px 12px", cursor: "pointer" }}>➕</button>
      </div>

      {Object.keys(byRecipe).length === 0 && done.length === 0 && (
        <div style={{ textAlign: "center", padding: 40, color: "#aaa" }}>
          <div style={{ fontSize: 40 }}>🧺</div>
          <div>La lista está vacía</div>
          <div style={{ fontSize: 12, marginTop: 4 }}>Agrega ingredientes desde una receta</div>
        </div>
      )}

      {Object.entries(byRecipe).map(([recipeName, items]) => (
        <div key={recipeName} style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: "#888", letterSpacing: 1, textTransform: "uppercase", marginBottom: 8, paddingLeft: 4 }}>{recipeName}</div>
          <div style={{ background: "white", borderRadius: 14, overflow: "hidden", boxShadow: "0 2px 10px rgba(0,0,0,0.06)" }}>
            {items.map((item, idx) => (
              <div key={item.id} style={{ display: "flex", alignItems: "center", padding: "12px 14px", borderBottom: idx < items.length-1 ? "1px solid #f0ece5" : "none" }}>
                <button onClick={() => toggle(item)} style={{ width: 22, height: 22, borderRadius: 6, border: "2px solid #4a7c1f", background: "white", cursor: "pointer", marginRight: 12, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontSize: 13 }} />
                <span style={{ flex: 1, fontSize: 14, color: "#333" }}>{item.name}</span>
                <button onClick={() => removeItem(item.id)} style={{ background: "none", border: "none", color: "#ccc", cursor: "pointer", fontSize: 16, padding: "0 4px" }}>×</button>
              </div>
            ))}
          </div>
        </div>
      ))}

      {done.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 12, color: "#aaa", letterSpacing: 1, textTransform: "uppercase", marginBottom: 8, paddingLeft: 4 }}>Comprados ({done.length})</div>
          <div style={{ background: "#fafafa", borderRadius: 14, overflow: "hidden" }}>
            {done.map((item, idx) => (
              <div key={item.id} style={{ display: "flex", alignItems: "center", padding: "10px 14px", borderBottom: idx < done.length-1 ? "1px solid #f0f0f0" : "none" }}>
                <button onClick={() => toggle(item)} style={{ width: 22, height: 22, borderRadius: 6, border: "none", background: "#4a7c1f", cursor: "pointer", marginRight: 12, flexShrink: 0, color: "white", fontSize: 13 }}>✓</button>
                <span style={{ flex: 1, fontSize: 14, textDecoration: "line-through", color: "#bbb" }}>{item.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Calendar Tab ─────────────────────────────────────────────────────────────
function CalendarTab({ calendar, setCalendar, recipes, showToast }) {
  const today = new Date();
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [selectedDay, setSelectedDay] = useState(null);
  const [showPicker, setShowPicker] = useState(null);

  const months = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
  const days = ["D","L","M","M","J","V","S"];
  const firstDay = new Date(currentYear, currentMonth, 1).getDay();
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const slots = ["desayuno", "almuerzo", "cena"];
  const slotEmoji = { desayuno: "☀️", almuerzo: "🌤", cena: "🌙" };

  const getDateKey = (day) => `${currentYear}-${String(currentMonth+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;

  const getDayMeals = (day) => {
    const key = getDateKey(day);
    const entries = calendar.filter(e => e.date === key);
    const result = {};
    entries.forEach(e => { result[e.slot] = e; });
    return result;
  };

  const setMeal = async (day, slot, recipe) => {
    const date = getDateKey(day);
    try {
      await DB.setMeal({ date, slot, recipe_id: recipe.id, recipe_name: recipe.name, recipe_emoji: recipe.emoji });
      const fresh = await DB.getCalendar();
      setCalendar(fresh);
      setShowPicker(null);
      showToast(`${recipe.name} en ${slot} 📅`);
    } catch { showToast("Error al guardar"); }
  };

  const removeMeal = async (day, slot) => {
    try {
      await DB.deleteMeal(getDateKey(day), slot);
      setCalendar(c => c.filter(e => !(e.date === getDateKey(day) && e.slot === slot)));
    } catch { showToast("Error al eliminar"); }
  };

  const dayMeals = selectedDay ? getDayMeals(selectedDay) : {};

  return (
    <div style={{ paddingTop: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <button onClick={() => { if (currentMonth === 0) { setCurrentMonth(11); setCurrentYear(y=>y-1); } else setCurrentMonth(m=>m-1); }} style={{ background: "white", border: "none", borderRadius: 10, padding: "8px 14px", cursor: "pointer", fontSize: 16 }}>‹</button>
        <div style={{ fontWeight: "bold", fontSize: 17 }}>{months[currentMonth]} {currentYear}</div>
        <button onClick={() => { if (currentMonth === 11) { setCurrentMonth(0); setCurrentYear(y=>y+1); } else setCurrentMonth(m=>m+1); }} style={{ background: "white", border: "none", borderRadius: 10, padding: "8px 14px", cursor: "pointer", fontSize: 16 }}>›</button>
      </div>

      <div style={{ background: "white", borderRadius: 18, padding: 16, boxShadow: "0 2px 12px rgba(0,0,0,0.07)", marginBottom: 16 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 4, marginBottom: 8 }}>
          {days.map((d,i) => <div key={i} style={{ textAlign: "center", fontSize: 11, color: "#999", fontWeight: "bold" }}>{d}</div>)}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 4 }}>
          {Array(firstDay).fill(null).map((_,i) => <div key={"e"+i} />)}
          {Array(daysInMonth).fill(null).map((_,i) => {
            const day = i + 1;
            const meals = getDayMeals(day);
            const hasMeals = Object.keys(meals).length > 0;
            const isToday = day === today.getDate() && currentMonth === today.getMonth() && currentYear === today.getFullYear();
            const isSelected = selectedDay === day;
            return (
              <button key={day} onClick={() => setSelectedDay(selectedDay === day ? null : day)} style={{ aspectRatio: "1", borderRadius: 10, border: "none", background: isSelected ? "#4a7c1f" : isToday ? "#f0f7e8" : "transparent", color: isSelected ? "white" : isToday ? "#4a7c1f" : "#333", cursor: "pointer", fontSize: 13, fontWeight: isToday ? "bold" : "normal", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column" }}>
                {day}
                {hasMeals && <div style={{ width: 4, height: 4, borderRadius: "50%", background: isSelected ? "rgba(255,255,255,0.7)" : "#4a7c1f", marginTop: 1 }} />}
              </button>
            );
          })}
        </div>
      </div>

      {selectedDay && (
        <div style={{ background: "white", borderRadius: 18, padding: 16, boxShadow: "0 2px 12px rgba(0,0,0,0.07)" }}>
          <div style={{ fontWeight: "bold", fontSize: 16, marginBottom: 14, color: "#333" }}>📅 {selectedDay} de {months[currentMonth]}</div>
          {slots.map(slot => (
            <div key={slot} style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, color: "#888", textTransform: "capitalize", marginBottom: 6 }}>{slotEmoji[slot]} {slot.charAt(0).toUpperCase()+slot.slice(1)}</div>
              {dayMeals[slot] ? (
                <div style={{ background: "#f0f7e8", borderRadius: 12, padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 14 }}>{dayMeals[slot].recipe_emoji} {dayMeals[slot].recipe_name}</span>
                  <button onClick={() => removeMeal(selectedDay, slot)} style={{ background: "none", border: "none", color: "#aaa", cursor: "pointer", fontSize: 16 }}>×</button>
                </div>
              ) : (
                <button onClick={() => setShowPicker(slot)} style={{ width: "100%", background: "#faf7f2", border: "2px dashed #d5cfc4", borderRadius: 12, padding: "10px", fontSize: 13, color: "#aaa", cursor: "pointer" }}>
                  + Agregar receta
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {showPicker && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 100, display: "flex", alignItems: "flex-end" }}>
          <div style={{ background: "white", borderRadius: "24px 24px 0 0", width: "100%", maxHeight: "60vh", overflowY: "auto", padding: 24 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
              <div style={{ fontWeight: "bold", fontSize: 16 }}>Elegir para {showPicker}</div>
              <button onClick={() => setShowPicker(null)} style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer" }}>✕</button>
            </div>
            {recipes.map(recipe => (
              <div key={recipe.id} onClick={() => setMeal(selectedDay, showPicker, recipe)} style={{ display: "flex", gap: 12, padding: "12px 0", borderBottom: "1px solid #f0ece5", cursor: "pointer", alignItems: "center" }}>
                <span style={{ fontSize: 28 }}>{recipe.emoji}</span>
                <div>
                  <div style={{ fontWeight: "bold", fontSize: 14 }}>{recipe.name}</div>
                  <div style={{ fontSize: 12, color: "#999" }}>{recipe.time} · {recipe.category}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── AI Tab ───────────────────────────────────────────────────────────────────
function AITab({ recipes, setRecipes, showToast, onDone }) {
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const suggestions = ["Pollo al curry con arroz", "Sopa de tomate casera", "Brownies de chocolate", "Ceviche de camarones", "Risotto de hongos"];

  const generate = async () => {
    if (!aiPrompt.trim()) return;
    setAiLoading(true);
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          messages: [{ role: "user", content: `Genera una receta de cocina para: "${aiPrompt}". Responde SOLO con JSON válido, sin texto adicional, sin backticks. El JSON debe tener: name (string), emoji (1 emoji), time (ej: "30 min"), servings (número), category (string), ingredients (array de strings), steps (array de strings).` }]
        })
      });
      const json = await res.json();
      const text = json.content?.find(b => b.type === "text")?.text || "";
      const clean = text.replace(/```json|```/g, "").trim();
      const recipe = JSON.parse(clean);
      const saved = await DB.addRecipe(recipe);
      setRecipes(r => [...r, saved[0]]);
      setAiPrompt("");
      showToast(`¡"${recipe.name}" guardada en la nube! ✨`);
      onDone();
    } catch (e) {
      showToast("Error al generar. Intentá de nuevo.");
    }
    setAiLoading(false);
  };

  return (
    <div style={{ paddingTop: 16 }}>
      <div style={{ background: "linear-gradient(135deg, #2d5016, #4a7c1f)", borderRadius: 20, padding: 20, color: "white", marginBottom: 20 }}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>✨</div>
        <div style={{ fontSize: 20, fontWeight: "bold", marginBottom: 6 }}>Chef IA</div>
        <div style={{ fontSize: 14, opacity: 0.85 }}>Describí un plato y te genero la receta completa, guardada directo en la nube para todos.</div>
      </div>
      <div style={{ background: "white", borderRadius: 16, padding: 16, boxShadow: "0 2px 12px rgba(0,0,0,0.07)", marginBottom: 16 }}>
        <textarea value={aiPrompt} onChange={e => setAiPrompt(e.target.value)} placeholder="Ej: Pasta con verduras asadas y queso de cabra..." style={{ width: "100%", border: "none", outline: "none", fontSize: 15, fontFamily: "Georgia, serif", resize: "none", minHeight: 80, color: "#333", boxSizing: "border-box" }} />
        <button onClick={generate} disabled={aiLoading || !aiPrompt.trim()} style={{ width: "100%", background: aiLoading ? "#aaa" : "#4a7c1f", color: "white", border: "none", borderRadius: 14, padding: 14, fontSize: 16, cursor: aiLoading ? "default" : "pointer", fontFamily: "Georgia, serif", marginTop: 8 }}>
          {aiLoading ? "⏳ Generando..." : "✨ Generar y guardar receta"}
        </button>
      </div>
      <div style={{ marginBottom: 8, fontSize: 13, color: "#888" }}>Sugerencias:</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {suggestions.map(s => (
          <button key={s} onClick={() => setAiPrompt(s)} style={{ background: "white", border: "1px solid #e8e0d5", borderRadius: 12, padding: "12px 16px", fontSize: 14, textAlign: "left", cursor: "pointer", color: "#444" }}>
            🍽 {s}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Share Modal ──────────────────────────────────────────────────────────────
function ShareModal({ onClose }) {
  const [copied, setCopied] = useState(false);
  const url = window.location.href;

  const copy = () => {
    navigator.clipboard.writeText(url).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ background: "white", borderRadius: 24, padding: 28, width: "100%", maxWidth: 360 }}>
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <div style={{ fontSize: 48 }}>🔗</div>
          <h2 style={{ margin: "8px 0 4px", fontSize: 22 }}>Compartir RecetApp</h2>
          <p style={{ color: "#888", fontSize: 14, margin: 0 }}>Cualquier persona con acceso a esta app ve los mismos datos en tiempo real. Recetas, compras y menú sincronizados.</p>
        </div>
        <div style={{ background: "#f0f7e8", borderRadius: 16, padding: 16, marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: "#888", marginBottom: 6 }}>Base de datos compartida</div>
          <div style={{ fontSize: 13, color: "#4a7c1f", fontWeight: "bold", wordBreak: "break-all" }}>oqnwdnflrjxruwlwcniz.supabase.co</div>
        </div>
        <div style={{ background: "#fff8e8", borderRadius: 12, padding: 14, marginBottom: 16, fontSize: 13, color: "#886622" }}>
          <strong>✅ Sincronización real activada</strong><br/>Todos los cambios se guardan en Supabase y se actualizan cada 10 segundos en todos los dispositivos.
        </div>
        <button onClick={copy} style={{ width: "100%", background: copied ? "#4a7c1f" : "#f0f7e8", color: copied ? "white" : "#4a7c1f", border: "none", borderRadius: 14, padding: 14, fontSize: 15, cursor: "pointer", marginBottom: 10, fontFamily: "Georgia, serif" }}>
          {copied ? "✅ Link copiado!" : "📋 Copiar link de la app"}
        </button>
        <button onClick={onClose} style={{ width: "100%", background: "#f5f5f5", border: "none", borderRadius: 14, padding: 14, fontSize: 15, cursor: "pointer", fontFamily: "Georgia, serif" }}>Cerrar</button>
      </div>
    </div>
  );
}
