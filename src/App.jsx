import { useState, useEffect, useCallback } from "react";

const SUPABASE_URL = "https://oqnwdnflrjxruwlwcniz.supabase.co";
const SUPABASE_KEY = "sb_publishable_2YNVtOzFlJCIcKARaoCmUQ_6anksnkL";

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
  if (!res.ok) { const err = await res.text(); throw new Error(err); }
  const text = await res.text();
  return text ? JSON.parse(text) : [];
};

const DB = {
  getRecipes: () => sb("recipes?order=created_at.asc", { method: "GET" }),
  addRecipe: (r) => sb("recipes", { method: "POST", body: JSON.stringify(r) }),
  updateRecipe: (id, r) => sb(`recipes?id=eq.${id}`, { method: "PATCH", body: JSON.stringify(r), prefer: "return=minimal" }),
  deleteRecipe: (id) => sb(`recipes?id=eq.${id}`, { method: "DELETE", prefer: "return=minimal" }),
  getShopping: () => sb("shopping_list?order=created_at.asc", { method: "GET" }),
  addShoppingItems: (items) => sb("shopping_list", { method: "POST", body: JSON.stringify(items) }),
  addShoppingItem: (item) => sb("shopping_list", { method: "POST", body: JSON.stringify(item) }),
  updateShoppingItem: (id, data) => sb(`shopping_list?id=eq.${id}`, { method: "PATCH", body: JSON.stringify(data), prefer: "return=minimal" }),
  toggleShoppingItem: (id, checked) => sb(`shopping_list?id=eq.${id}`, { method: "PATCH", body: JSON.stringify({ checked }), prefer: "return=minimal" }),
  deleteShoppingItem: (id) => sb(`shopping_list?id=eq.${id}`, { method: "DELETE", prefer: "return=minimal" }),
  deleteChecked: () => sb(`shopping_list?checked=eq.true`, { method: "DELETE", prefer: "return=minimal" }),
  getCalendar: () => sb("meal_calendar?order=date.asc", { method: "GET" }),
  setMeal: (entry) => sb("meal_calendar", { method: "POST", body: JSON.stringify(entry), prefer: "resolution=merge-duplicates,return=representation" }),
  deleteMeal: (date, slot) => sb(`meal_calendar?date=eq.${date}&slot=eq.${slot}`, { method: "DELETE", prefer: "return=minimal" }),
};

const UNITS = ["und","g","kg","ml","L","taza","cdta","cda"];
const SLOTS = ["desayuno","almuerzo","comida"];
const SLOT_EMOJI = { desayuno:"☀️", almuerzo:"🌤", comida:"🌙" };
const MONTHS = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

const toBase = (qty, unit) => {
  if (unit==="kg") return {qty:qty*1000,unit:"g"};
  if (unit==="L") return {qty:qty*1000,unit:"ml"};
  return {qty,unit};
};
const fromBase = (qty, unit) => {
  if (unit==="g"&&qty>=1000) return {qty:qty/1000,unit:"kg"};
  if (unit==="ml"&&qty>=1000) return {qty:qty/1000,unit:"L"};
  return {qty,unit};
};
const fmtQty = (n) => Number.isInteger(n)?String(n):parseFloat(n.toFixed(2)).toString();
const blankIng = () => ({name:"",qty:"",unit:"und"});
const parseIng = (ing) => {
  if (typeof ing==="object"&&ing!==null&&"name" in ing) return ing;
  return {name:ing,qty:"",unit:"und"};
};
const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
};

const DEFAULT_RECIPES = [
  { name:"Tacos de Pollo",emoji:"🌮",time:"30 min",servings:4,category:"Mexicana",
    ingredients:[{name:"Pechuga de pollo",qty:500,unit:"g"},{name:"Tortillas de maíz",qty:8,unit:"und"},{name:"Cebolla",qty:1,unit:"und"},{name:"Tomates",qty:2,unit:"und"},{name:"Cilantro",qty:1,unit:"taza"},{name:"Limón",qty:2,unit:"und"},{name:"Aceite",qty:2,unit:"cda"}],
    steps:["Cortar el pollo en tiras y sazonar.","Calentar aceite y cocinar el pollo.","Picar cebolla, tomate y cilantro.","Calentar tortillas.","Armar los tacos."]},
  { name:"Pasta Carbonara",emoji:"🍝",time:"20 min",servings:2,category:"Italiana",
    ingredients:[{name:"Espagueti",qty:200,unit:"g"},{name:"Panceta",qty:100,unit:"g"},{name:"Huevos",qty:2,unit:"und"},{name:"Queso parmesano",qty:50,unit:"g"},{name:"Sal",qty:1,unit:"cdta"}],
    steps:["Cocinar la pasta al dente.","Freír la panceta.","Batir huevos con queso parmesano.","Mezclar pasta caliente con panceta.","Agregar mezcla de huevos fuera del fuego."]},
  { name:"Ensalada César",emoji:"🥗",time:"15 min",servings:2,category:"Ensaladas",
    ingredients:[{name:"Lechuga romana",qty:1,unit:"und"},{name:"Pollo a la plancha",qty:100,unit:"g"},{name:"Queso parmesano",qty:50,unit:"g"},{name:"Crutones",qty:1,unit:"taza"},{name:"Aderezo César",qty:3,unit:"cda"},{name:"Limón",qty:1,unit:"und"}],
    steps:["Lavar y trozar la lechuga.","Grillar el pollo y cortar en tiras.","Mezclar lechuga, pollo y crutones.","Agregar aderezo César al gusto.","Decorar con queso parmesano rallado."]}
];

const EMOJIS = ["🍝","🌮","🥗","🍕","🍜","🥘","🍲","🥩","🍗","🥦","🍣","🍱","🥚","🍳","🥞","🧆","🥙","🫕","🍛","🍤","🦞","🍖","🧁","🎂","🍰","🍮","🥧","🍩","🍪"];

// ─── Add to Calendar Modal (from recipe card) ─────────────────────────────────
function AddToCalendarModal({ recipe, calendar, onSave, onClose, showToast }) {
  const [date, setDate] = useState(todayStr());
  const [slot, setSlot] = useState("almuerzo");
  const [saving, setSaving] = useState(false);

  // Check if slot already taken
  const taken = calendar.some(e => e.date===date && e.slot===slot);

  const save = async () => {
    setSaving(true);
    try {
      await onSave(date, slot, recipe);
      showToast(`${recipe.emoji} ${recipe.name} → ${slot} del ${date.split("-").reverse().join("/")} 📅`);
      onClose();
    } catch { showToast("Error al guardar"); }
    setSaving(false);
  };

  return (
    <div style={{ position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",padding:20 }}>
      <div style={{ background:"white",borderRadius:24,padding:24,width:"100%",maxWidth:360 }}>
        <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20 }}>
          <div style={{ fontWeight:"bold",fontSize:18 }}>📅 Agregar al menú</div>
          <button onClick={onClose} style={{ background:"#f5f5f5",border:"none",borderRadius:"50%",width:32,height:32,cursor:"pointer",fontSize:16 }}>✕</button>
        </div>

        {/* Recipe preview */}
        <div style={{ background:"#e0f2fe",borderRadius:16,padding:"12px 16px",marginBottom:20,display:"flex",gap:12,alignItems:"center" }}>
          <span style={{ fontSize:32 }}>{recipe.emoji}</span>
          <div>
            <div style={{ fontWeight:"bold",fontSize:15 }}>{recipe.name}</div>
            <div style={{ fontSize:12,color:"#888" }}>{recipe.category} · {recipe.time}</div>
          </div>
        </div>

        {/* Date picker */}
        <div style={{ marginBottom:16 }}>
          <label style={{ fontSize:12,color:"#888",display:"block",marginBottom:6,textTransform:"uppercase",letterSpacing:1 }}>Fecha</label>
          <input type="date" value={date} onChange={e=>setDate(e.target.value)}
            style={{ width:"100%",border:"2px solid #bae6fd",borderRadius:12,padding:"10px 14px",fontSize:15,fontFamily:"Georgia,serif",outline:"none",boxSizing:"border-box" }} />
        </div>

        {/* Slot picker */}
        <div style={{ marginBottom:20 }}>
          <label style={{ fontSize:12,color:"#888",display:"block",marginBottom:8,textTransform:"uppercase",letterSpacing:1 }}>Momento del día</label>
          <div style={{ display:"flex",gap:8 }}>
            {SLOTS.map(s => (
              <button key={s} onClick={()=>setSlot(s)} style={{ flex:1,padding:"10px 6px",borderRadius:12,border:"2px solid",borderColor:slot===s?"#0e7490":"#bae6fd",background:slot===s?"#e0f2fe":"white",color:slot===s?"#0e7490":"#555",cursor:"pointer",fontSize:12,fontFamily:"Georgia,serif",textTransform:"capitalize" }}>
                <div style={{ fontSize:18 }}>{SLOT_EMOJI[s]}</div>
                {s}
              </button>
            ))}
          </div>
        </div>

        {taken && (
          <div style={{ background:"#fff8e8",borderRadius:12,padding:"10px 14px",marginBottom:14,fontSize:13,color:"#886622" }}>
            ⚠️ Ya hay una receta en ese slot. Se va a reemplazar.
          </div>
        )}

        <button onClick={save} disabled={saving} style={{ width:"100%",background:saving?"#aaa":"#0e7490",color:"white",border:"none",borderRadius:14,padding:14,fontSize:16,cursor:saving?"default":"pointer",fontFamily:"Georgia,serif" }}>
          {saving?"⏳ Guardando...":"✅ Agregar al calendario"}
        </button>
      </div>
    </div>
  );
}

// ─── Ingredient base ──────────────────────────────────────────────────────────
const BASE_INGREDIENTS = [
  // Carnes
  "Pechuga de pollo","Muslo de pollo","Pollo entero","Carne molida","Lomo","Filete","Costillas","Tocino","Panceta","Jamón","Salchicha","Chorizo","Pavo","Cerdo","Cordero",
  // Mariscos
  "Salmón","Atún","Merluza","Camarón","Langostino","Pulpo","Calamar","Mejillones","Almejas",
  // Vegetales
  "Cebolla","Ajo","Tomate","Zanahoria","Papa","Papas","Pimiento","Pimiento rojo","Pimiento verde","Zapallo","Zucchini","Brócoli","Coliflor","Espinaca","Lechuga","Apio","Pepino","Berenjena","Champiñones","Puerro","Remolacha","Choclo","Arvejas","Poroto","Lenteja","Garbanzo","Espárrago",
  // Frutas
  "Limón","Naranja","Manzana","Plátano","Frutilla","Arándano","Pera","Durazno","Mango","Piña","Uva","Kiwi","Frambuesa","Melón","Sandía","Ciruela","Cereza",
  // Lácteos
  "Leche","Crema","Queso","Queso parmesano","Queso rallado","Queso crema","Mantequilla","Yogur","Crema agria","Mozzarella",
  // Huevos
  "Huevo","Huevos","Yema","Clara",
  // Harinas y granos
  "Harina","Harina de trigo","Maicena","Arroz","Arroz integral","Pasta","Espagueti","Fideos","Lasaña","Avena","Pan","Pan rallado","Crutones","Galletas",
  // Aceites y salsas
  "Aceite de oliva","Aceite","Vinagre","Salsa de tomate","Salsa soja","Mayonesa","Mostaza","Ketchup","Salsa inglesa","Aderezo César",
  // Especias y condimentos
  "Sal","Pimienta","Pimienta negra","Comino","Orégano","Paprika","Curry","Canela","Nuez moscada","Tomillo","Romero","Laurel","Perejil","Cilantro","Albahaca","Jengibre","Cúrcuma","Ají","Merkén","Azúcar","Azúcar impalpable","Miel","Vainilla",
  // Caldos y líquidos
  "Caldo de pollo","Caldo de carne","Caldo de verduras","Vino blanco","Vino tinto","Leche de coco","Jugo de limón","Agua",
  // Frutos secos
  "Nuez","Almendra","Maní","Pistacho","Avellana","Semilla de sésamo","Semilla de girasol",
  // Otros
  "Chocolate","Cacao","Levadura","Polvo de hornear","Bicarbonato","Gelatina","Crema pastelera"
];

// ─── Ingredient Row with autocomplete ────────────────────────────────────────
function IngRow({ ing, idx, onChange, onRemove, canRemove, allIngredients }) {
  const [open, setOpen] = useState(false);
  const [localVal, setLocalVal] = useState(ing.name);

  // Merge base + custom ingredients from existing recipes, deduplicated
  const combined = [...new Set([...BASE_INGREDIENTS, ...allIngredients])].sort((a,b)=>a.localeCompare(b));

  const suggestions = localVal.trim().length >= 1
    ? combined.filter(s => s.toLowerCase().includes(localVal.toLowerCase()) && s.toLowerCase() !== localVal.toLowerCase()).slice(0, 6)
    : [];

  const select = (name) => {
    setLocalVal(name);
    onChange({...ing, name});
    setOpen(false);
  };

  return (
    <div style={{ display:"flex",gap:6,alignItems:"flex-start",marginBottom:6 }}>
      <div style={{ width:22,height:22,borderRadius:"50%",background:"#0e7490",color:"white",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,flexShrink:0,marginTop:8 }}>{idx+1}</div>
      <div style={{ flex:2,position:"relative",minWidth:0 }}>
        <input
          value={localVal}
          onChange={e=>{setLocalVal(e.target.value);onChange({...ing,name:e.target.value});setOpen(true);}}
          onFocus={()=>setOpen(true)}
          onBlur={()=>setTimeout(()=>setOpen(false),150)}
          placeholder="Ingrediente"
          style={{ width:"100%",border:"2px solid #bae6fd",borderRadius:10,padding:"7px 10px",fontSize:13,fontFamily:"Georgia,serif",outline:"none",background:"white",boxSizing:"border-box" }}
        />
        {open && suggestions.length>0 && (
          <div style={{ position:"absolute",top:"100%",left:0,right:0,background:"white",borderRadius:10,boxShadow:"0 6px 20px rgba(0,0,0,0.12)",zIndex:50,maxHeight:180,overflowY:"auto",border:"1px solid #bae6fd" }}>
            {suggestions.map(s=>(
              <div key={s} onMouseDown={()=>select(s)} style={{ padding:"8px 12px",fontSize:13,cursor:"pointer",borderBottom:"1px solid #f5f5f5",color:"#333" }}
                onMouseEnter={e=>e.currentTarget.style.background="#e0f2fe"}
                onMouseLeave={e=>e.currentTarget.style.background="white"}>
                {s}
              </div>
            ))}
          </div>
        )}
      </div>
      <input type="number" min="0" step="any" value={ing.qty} onChange={e=>onChange({...ing,qty:e.target.value})} placeholder="Cant." style={{ width:58,border:"2px solid #bae6fd",borderRadius:10,padding:"7px 6px",fontSize:13,fontFamily:"Georgia,serif",outline:"none",background:"white",textAlign:"center" }} />
      <select value={ing.unit} onChange={e=>onChange({...ing,unit:e.target.value})} style={{ border:"2px solid #bae6fd",borderRadius:10,padding:"7px 4px",fontSize:12,fontFamily:"Georgia,serif",outline:"none",background:"white",color:"#333" }}>
        {UNITS.map(u=><option key={u} value={u}>{u}</option>)}
      </select>
      {canRemove&&<button onClick={onRemove} style={{ background:"#fff0f0",border:"none",borderRadius:8,width:28,height:28,color:"#cc3333",cursor:"pointer",flexShrink:0,fontSize:14,marginTop:4 }}>×</button>}
    </div>
  );
}

// ─── Recipe Form ──────────────────────────────────────────────────────────────
function RecipeForm({ initial, onSave, onClose, showToast, allIngredients }) {
  const normalizeIngs = (ings) => (ings||[]).map(parseIng);
  const blank = {name:"",emoji:"🍽",time:"",servings:2,category:"",ingredients:[blankIng()],steps:[""]};
  const [form,setForm] = useState(initial?{...initial,ingredients:normalizeIngs(initial.ingredients),steps:[...(initial.steps||[])]}:blank);
  const [saving,setSaving] = useState(false);
  const [showEmojiPicker,setShowEmojiPicker] = useState(false);

  const set=(k,v)=>setForm(f=>({...f,[k]:v}));
  const updateIng=(idx,val)=>setForm(f=>{const a=[...f.ingredients];a[idx]=val;return{...f,ingredients:a};});
  const addIng=()=>setForm(f=>({...f,ingredients:[...f.ingredients,blankIng()]}));
  const removeIng=(idx)=>setForm(f=>{const a=f.ingredients.filter((_,i)=>i!==idx);return{...f,ingredients:a.length?a:[blankIng()]};});
  const updateStep=(idx,val)=>setForm(f=>{const a=[...f.steps];a[idx]=val;return{...f,steps:a};});
  const addStep=()=>setForm(f=>({...f,steps:[...f.steps,""]}));
  const removeStep=(idx)=>setForm(f=>{const a=f.steps.filter((_,i)=>i!==idx);return{...f,steps:a.length?a:[""]};});

  const save=async()=>{
    if(!form.name.trim()){showToast("Ponele un nombre a la receta");return;}
    setSaving(true);
    try {
      const data={...form,servings:Number(form.servings)||2,ingredients:form.ingredients.filter(i=>i.name.trim()).map(i=>({name:i.name.trim(),qty:i.qty===""?0:Number(i.qty),unit:i.unit})),steps:form.steps.filter(s=>s.trim())};
      await onSave(data);onClose();
    } catch{showToast("Error al guardar");}
    setSaving(false);
  };

  return (
    <div style={{ position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",zIndex:200,display:"flex",alignItems:"flex-end" }}>
      <div style={{ background:"#f0f9ff",borderRadius:"24px 24px 0 0",width:"100%",maxHeight:"95vh",overflowY:"auto",paddingBottom:24 }}>
        <div style={{ background:"linear-gradient(135deg,#0e7490,#0e7490)",padding:"18px 20px",borderRadius:"24px 24px 0 0",display:"flex",justifyContent:"space-between",alignItems:"center" }}>
          <div style={{ color:"white",fontWeight:"bold",fontSize:18 }}>{initial?"✏️ Editar receta":"➕ Nueva receta"}</div>
          <button onClick={onClose} style={{ background:"rgba(255,255,255,0.2)",border:"none",borderRadius:"50%",width:32,height:32,color:"white",cursor:"pointer",fontSize:16 }}>✕</button>
        </div>
        <div style={{ padding:"20px 16px",display:"flex",flexDirection:"column",gap:16 }}>
          <div style={{ display:"flex",gap:12,alignItems:"flex-start" }}>
            <div style={{ position:"relative" }}>
              <button onClick={()=>setShowEmojiPicker(e=>!e)} style={{ fontSize:44,background:"white",border:"2px solid #bae6fd",borderRadius:16,width:70,height:70,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center" }}>{form.emoji}</button>
              {showEmojiPicker&&(
                <div style={{ position:"absolute",top:78,left:0,background:"white",borderRadius:16,padding:10,boxShadow:"0 8px 30px rgba(0,0,0,0.15)",display:"grid",gridTemplateColumns:"repeat(6,1fr)",gap:4,zIndex:10,width:220 }}>
                  {EMOJIS.map(e=><button key={e} onClick={()=>{set("emoji",e);setShowEmojiPicker(false);}} style={{ fontSize:24,background:"none",border:"none",cursor:"pointer",padding:4,borderRadius:8 }}>{e}</button>)}
                </div>
              )}
            </div>
            <div style={{ flex:1 }}>
              <label style={{ fontSize:12,color:"#888",display:"block",marginBottom:4 }}>Nombre *</label>
              <input value={form.name} onChange={e=>set("name",e.target.value)} placeholder="Ej: Pollo al limón" style={{ width:"100%",border:"2px solid #bae6fd",borderRadius:12,padding:"10px 12px",fontSize:15,fontFamily:"Georgia,serif",outline:"none",boxSizing:"border-box",background:"white" }} />
            </div>
          </div>
          <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10 }}>
            <div style={{ gridColumn:"1/-1" }}>
              <label style={{ fontSize:11,color:"#888",display:"block",marginBottom:4 }}>Categoría</label>
              <select value={form.category} onChange={e=>set("category",e.target.value)} style={{ width:"100%",border:"2px solid #bae6fd",borderRadius:10,padding:"8px 10px",fontSize:14,fontFamily:"Georgia,serif",outline:"none",boxSizing:"border-box",background:"white" }}>
                <option value="">Elegir categoría...</option>
                {CATEGORIES.map(c=><option key={c.name} value={c.name}>{c.emoji} {c.name}</option>)}
              </select>
            </div>
            {[{label:"Tiempo",key:"time",placeholder:"30 min"},{label:"Porciones",key:"servings",placeholder:"4",type:"number"}].map(f=>(
              <div key={f.key}>
                <label style={{ fontSize:11,color:"#888",display:"block",marginBottom:4 }}>{f.label}</label>
                <input type={f.type||"text"} value={form[f.key]} onChange={e=>set(f.key,e.target.value)} placeholder={f.placeholder} style={{ width:"100%",border:"2px solid #bae6fd",borderRadius:10,padding:"8px 10px",fontSize:14,fontFamily:"Georgia,serif",outline:"none",boxSizing:"border-box",background:"white" }} />
              </div>
            ))}
          </div>
          <div>
            <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8 }}>
              <label style={{ fontSize:14,fontWeight:"bold",color:"#333" }}>🧺 Ingredientes</label>
              <button onClick={addIng} style={{ background:"#e0f2fe",color:"#0e7490",border:"none",borderRadius:10,padding:"4px 10px",fontSize:13,cursor:"pointer" }}>+ Agregar</button>
            </div>
            <div style={{ display:"flex",gap:6,marginBottom:4,paddingLeft:28 }}>
              <div style={{ flex:2,fontSize:10,color:"#aaa",textTransform:"uppercase",letterSpacing:1 }}>Ingrediente</div>
              <div style={{ width:58,fontSize:10,color:"#aaa",textTransform:"uppercase",letterSpacing:1,textAlign:"center" }}>Cant.</div>
              <div style={{ width:52,fontSize:10,color:"#aaa",textTransform:"uppercase",letterSpacing:1 }}>Unidad</div>
            </div>
            {form.ingredients.map((ing,idx)=><IngRow key={idx} ing={ing} idx={idx} onChange={val=>updateIng(idx,val)} onRemove={()=>removeIng(idx)} canRemove={form.ingredients.length>1} allIngredients={allIngredients||[]} />)}
          </div>
          <div>
            <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8 }}>
              <label style={{ fontSize:14,fontWeight:"bold",color:"#333" }}>👩‍🍳 Pasos</label>
              <button onClick={addStep} style={{ background:"#e0f2fe",color:"#0e7490",border:"none",borderRadius:10,padding:"4px 10px",fontSize:13,cursor:"pointer" }}>+ Agregar</button>
            </div>
            {form.steps.map((step,idx)=>(
              <div key={idx} style={{ display:"flex",gap:8,alignItems:"flex-start",marginBottom:8 }}>
                <div style={{ width:24,height:24,borderRadius:"50%",background:"#0e7490",color:"white",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,flexShrink:0,marginTop:8 }}>{idx+1}</div>
                <textarea value={step} onChange={e=>updateStep(idx,e.target.value)} placeholder={`Paso ${idx+1}`} rows={2} style={{ flex:1,border:"2px solid #bae6fd",borderRadius:10,padding:"8px 12px",fontSize:14,fontFamily:"Georgia,serif",outline:"none",resize:"none",background:"white" }} />
                {form.steps.length>1&&<button onClick={()=>removeStep(idx)} style={{ background:"#fff0f0",border:"none",borderRadius:8,width:30,height:30,color:"#cc3333",cursor:"pointer",flexShrink:0,marginTop:6 }}>×</button>}
              </div>
            ))}
          </div>
          <button onClick={save} disabled={saving} style={{ width:"100%",background:saving?"#aaa":"#0e7490",color:"white",border:"none",borderRadius:16,padding:16,fontSize:16,cursor:saving?"default":"pointer",fontFamily:"Georgia,serif",marginTop:4 }}>
            {saving?"⏳ Guardando...":initial?"✅ Guardar cambios":"✅ Crear receta"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [tab,setTab] = useState("recipes");
  const [recipes,setRecipes] = useState([]);
  const [shopping,setShopping] = useState([]);
  const [calendar,setCalendar] = useState([]);
  const [loading,setLoading] = useState(true);
  const [selectedRecipe,setSelectedRecipe] = useState(null);
  const [editingRecipe,setEditingRecipe] = useState(null);
  const [showNewForm,setShowNewForm] = useState(false);
  const [addToCalRecipe,setAddToCalRecipe] = useState(null); // recipe to add to calendar
  const [toast,setToast] = useState(null);
  const [shareModal,setShareModal] = useState(false);

  const showToast=(msg)=>{setToast(msg);setTimeout(()=>setToast(null),3000);};

  const loadAll=useCallback(async()=>{
    try {
      const [r,s,c]=await Promise.all([DB.getRecipes(),DB.getShopping(),DB.getCalendar()]);
      setRecipes(r);setShopping(s);setCalendar(c);
      if(r.length===0){for(const recipe of DEFAULT_RECIPES)await DB.addRecipe(recipe);setRecipes(await DB.getRecipes());}
    } catch{showToast("Error conectando a la base de datos");}
    setLoading(false);
  },[]);

  useEffect(()=>{loadAll();},[loadAll]);
  useEffect(()=>{
    const iv=setInterval(async()=>{try{const [r,s,c]=await Promise.all([DB.getRecipes(),DB.getShopping(),DB.getCalendar()]);setRecipes(r);setShopping(s);setCalendar(c);}catch{}},10000);
    return()=>clearInterval(iv);
  },[]);

  const addToCart=async(ingredients,recipeName)=>{
    const ings=ingredients.map(parseIng);
    const freshShopping=await DB.getShopping();setShopping(freshShopping);
    const toUpdate=[],toAdd=[];
    for(const ing of ings){
      if(!ing.name.trim())continue;
      const {qty:baseQty,unit:baseUnit}=toBase(Number(ing.qty)||0,ing.unit);
      const normName=ing.name.trim().toLowerCase();
      const existing=freshShopping.find(s=>s.name.trim().toLowerCase()===normName&&!s.checked);
      if(existing){
        const {qty:exBase,unit:exBaseUnit}=toBase(Number(existing.qty)||0,existing.unit);
        if(exBaseUnit===baseUnit){const sumBase=exBase+baseQty;const {qty:fq,unit:fu}=fromBase(sumBase,baseUnit);toUpdate.push({id:existing.id,qty:fq,unit:fu});}
      } else {
        const {qty:dq,unit:du}=fromBase(baseQty,baseUnit);
        toAdd.push({name:ing.name.trim(),qty:dq,unit:du,checked:false,from_recipe:recipeName});
      }
    }
    try {
      for(const u of toUpdate)await DB.updateShoppingItem(u.id,{qty:u.qty,unit:u.unit});
      if(toAdd.length>0)await DB.addShoppingItems(toAdd);
      setShopping(await DB.getShopping());
      showToast(`🛒 ${toAdd.length} nuevos + ${toUpdate.length} actualizados`);
    } catch{showToast("Error al agregar ingredientes");}
  };

  const handleAddToCalendar=async(date,slot,recipe)=>{
    await DB.setMeal({date,slot,recipe_id:recipe.id,recipe_name:recipe.name,recipe_emoji:recipe.emoji});
    setCalendar(await DB.getCalendar());
  };

  const handleCreateRecipe=async(data)=>{const saved=await DB.addRecipe(data);setRecipes(r=>[...r,saved[0]]);showToast(`"${data.name}" creada ✅`);};
  const handleEditRecipe=async(data)=>{
    await DB.updateRecipe(editingRecipe.id,data);
    setRecipes(r=>r.map(x=>x.id===editingRecipe.id?{...x,...data}:x));
    if(selectedRecipe?.id===editingRecipe.id)setSelectedRecipe({...editingRecipe,...data});
    showToast(`"${data.name}" actualizada ✅`);
  };

  const pendingCount=shopping.filter(i=>!i.checked).length;

  if(loading)return(
    <div style={{ display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:"100vh",background:"#f0f9ff",gap:16 }}>
      <svg width="56" height="56" viewBox="0 0 38 38" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M6 8 Q6 6 8 6 L19 8 L19 32 L8 30 Q6 30 6 28 Z" fill="#0e7490"/>
        <path d="M32 8 Q32 6 30 6 L19 8 L19 32 L30 30 Q32 30 32 28 Z" fill="#0e7490" opacity="0.6"/>
        <rect x="18" y="7" width="2" height="25" rx="1" fill="#164e63" opacity="0.4"/>
        <line x1="9" y1="14" x2="17" y2="14.5" stroke="white" stroke-width="1.5" stroke-linecap="round" opacity="0.7"/>
        <line x1="9" y1="18" x2="17" y2="18.5" stroke="white" stroke-width="1.5" stroke-linecap="round" opacity="0.7"/>
        <line x1="9" y1="22" x2="17" y2="22.5" stroke="white" stroke-width="1.5" stroke-linecap="round" opacity="0.7"/>
        <line x1="25" y1="12" x2="25" y2="28" stroke="white" stroke-width="1.8" stroke-linecap="round" opacity="0.7"/>
        <line x1="23" y1="12" x2="23" y2="17" stroke="white" stroke-width="1.5" stroke-linecap="round" opacity="0.7"/>
        <line x1="27" y1="12" x2="27" y2="17" stroke="white" stroke-width="1.5" stroke-linecap="round" opacity="0.7"/>
      </svg>
      <div style={{ fontSize:20,fontWeight:"bold",color:"#0e7490" }}>RecetApp</div>
      <div style={{ fontSize:14,color:"#999" }}>Conectando...</div>
    </div>
  );

  const LogoSVG = () => (
    <svg width="36" height="36" viewBox="0 0 38 38" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M6 8 Q6 6 8 6 L19 8 L19 32 L8 30 Q6 30 6 28 Z" fill="white"/>
      <path d="M32 8 Q32 6 30 6 L19 8 L19 32 L30 30 Q32 30 32 28 Z" fill="white" opacity="0.7"/>
      <rect x="18" y="7" width="2" height="25" rx="1" fill="#0e7490" opacity="0.35"/>
      <line x1="9" y1="14" x2="17" y2="14.5" stroke="#0e7490" stroke-width="1.5" stroke-linecap="round" opacity="0.35"/>
      <line x1="9" y1="18" x2="17" y2="18.5" stroke="#0e7490" stroke-width="1.5" stroke-linecap="round" opacity="0.35"/>
      <line x1="9" y1="22" x2="17" y2="22.5" stroke="#0e7490" stroke-width="1.5" stroke-linecap="round" opacity="0.35"/>
      <line x1="25" y1="12" x2="25" y2="28" stroke="#0e7490" stroke-width="1.8" stroke-linecap="round" opacity="0.35"/>
      <line x1="23" y1="12" x2="23" y2="17" stroke="#0e7490" stroke-width="1.5" stroke-linecap="round" opacity="0.35"/>
      <line x1="27" y1="12" x2="27" y2="17" stroke="#0e7490" stroke-width="1.5" stroke-linecap="round" opacity="0.35"/>
    </svg>
  );

  return (
    <div style={{ fontFamily:"'Georgia',serif",background:"#f0f9ff",minHeight:"100vh",maxWidth:480,margin:"0 auto",position:"relative",paddingBottom:80 }}>
      <div style={{ background:"#0e7490",padding:"20px 20px 16px",color:"white" }}>
        <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center" }}>
          <div style={{ display:"flex",alignItems:"center",gap:12 }}>
            <LogoSVG />
            <div>
              <div style={{ fontSize:11,letterSpacing:3,opacity:0.6,textTransform:"uppercase",color:"#cffafe" }}>Sincronizado en la nube</div>
              <h1 style={{ margin:0,fontSize:24,fontWeight:"bold",letterSpacing:-0.5 }}>RecetApp</h1>
            </div>
          </div>
          <button onClick={()=>setShareModal(true)} style={{ background:"rgba(255,255,255,0.15)",border:"none",borderRadius:12,padding:"8px 14px",color:"white",cursor:"pointer",fontSize:13 }}>🔗 Compartir</button>
        </div>
      </div>
      <div style={{ padding:"0 16px" }}>
        {tab==="recipes"&&<RecipesTab recipes={recipes} setRecipes={setRecipes} onSelect={setSelectedRecipe} onNew={()=>setShowNewForm(true)} addToCart={addToCart} onAddToCalendar={r=>setAddToCalRecipe(r)} showToast={showToast} />}
        {tab==="cart"&&<ShoppingTab shopping={shopping} setShopping={setShopping} showToast={showToast} />}
        {tab==="calendar"&&<CalendarTab calendar={calendar} setCalendar={setCalendar} recipes={recipes} showToast={showToast} onAddMeal={handleAddToCalendar} />}
        {tab==="ai"&&<AITab recipes={recipes} setRecipes={setRecipes} showToast={showToast} onDone={()=>setTab("recipes")} />}
      </div>
      <div style={{ position:"fixed",bottom:0,left:"50%",transform:"translateX(-50%)",width:"100%",maxWidth:480,background:"white",borderTop:"1px solid #bae6fd",display:"flex",padding:"8px 0 12px" }}>
        {[{id:"recipes",emoji:"📖",label:"Recetas"},{id:"cart",emoji:"🛒",label:pendingCount?`Compras (${pendingCount})`:"Compras"},{id:"calendar",emoji:"📅",label:"Menú"},{id:"ai",emoji:"✨",label:"IA Chef"}].map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)} style={{ flex:1,background:"none",border:"none",cursor:"pointer",padding:"4px 0",display:"flex",flexDirection:"column",alignItems:"center",gap:2 }}>
            <span style={{ fontSize:22 }}>{t.emoji}</span>
            <span style={{ fontSize:10,color:tab===t.id?"#0e7490":"#999",fontWeight:tab===t.id?"bold":"normal" }}>{t.label}</span>
          </button>
        ))}
      </div>
      {selectedRecipe&&<RecipeModal recipe={selectedRecipe} onClose={()=>setSelectedRecipe(null)} onEdit={()=>{setEditingRecipe(selectedRecipe);setSelectedRecipe(null);}} onDelete={async()=>{try{await DB.deleteRecipe(selectedRecipe.id);setRecipes(r=>r.filter(x=>x.id!==selectedRecipe.id));setSelectedRecipe(null);showToast("Receta eliminada");}catch{showToast("Error al eliminar");}}} addToCart={addToCart} onAddToCalendar={()=>{setAddToCalRecipe(selectedRecipe);setSelectedRecipe(null);}} />}
      {showNewForm&&<RecipeForm onSave={handleCreateRecipe} onClose={()=>setShowNewForm(false)} showToast={showToast} allIngredients={[...new Set(recipes.flatMap(r=>(r.ingredients||[]).map(i=>parseIng(i).name).filter(Boolean)))]} />}
      {editingRecipe&&<RecipeForm initial={editingRecipe} onSave={handleEditRecipe} onClose={()=>setEditingRecipe(null)} showToast={showToast} allIngredients={[...new Set(recipes.flatMap(r=>(r.ingredients||[]).map(i=>parseIng(i).name).filter(Boolean)))]} />}
      {addToCalRecipe&&<AddToCalendarModal recipe={addToCalRecipe} calendar={calendar} onSave={handleAddToCalendar} onClose={()=>setAddToCalRecipe(null)} showToast={showToast} />}
      {shareModal&&<ShareModal onClose={()=>setShareModal(false)} />}
      {toast&&<div style={{ position:"fixed",bottom:90,left:"50%",transform:"translateX(-50%)",background:"#0e7490",color:"white",padding:"10px 20px",borderRadius:20,fontSize:13,zIndex:999,whiteSpace:"nowrap",boxShadow:"0 4px 20px rgba(0,0,0,0.2)" }}>{toast}</div>}
    </div>
  );
}

// ─── Fixed categories with icons ─────────────────────────────────────────────
const CATEGORIES = [
  { name:"Tragos y bebidas",   emoji:"🍹" },
  { name:"Aperitivos",         emoji:"🧀" },
  { name:"Sopas",              emoji:"🍲" },
  { name:"Entradas",           emoji:"🥗" },
  { name:"Pescados y mariscos",emoji:"🐟" },
  { name:"Carnes",             emoji:"🥩" },
  { name:"Cocina internacional",emoji:"🌍" },
  { name:"Acompañamientos",    emoji:"🥦" },
  { name:"Postres y repostería",emoji:"🍰" },
];

// ─── Recipes Tab ──────────────────────────────────────────────────────────────
function RecipesTab({ recipes, setRecipes, onSelect, onNew, addToCart, onAddToCalendar, showToast }) {
  const [searchQ, setSearchQ] = useState("");
  const [view, setView] = useState("todos"); // "todos" | "categorias"
  const [selectedCat, setSelectedCat] = useState(null); // null = show grid, string = show recipes of that cat

  const filtered = recipes.filter(r =>
    r.name.toLowerCase().includes(searchQ.toLowerCase()) &&
    (selectedCat ? r.category === selectedCat : true)
  );

  const countByCat = (catName) => recipes.filter(r => r.category === catName).length;

  // When switching to "todos", reset category filter
  const switchView = (v) => { setView(v); setSelectedCat(null); setSearchQ(""); };

  return (
    <div style={{ paddingTop:16 }}>
      {/* Search + New button */}
      <div style={{ display:"flex",gap:10,marginBottom:14 }}>
        <div style={{ background:"white",borderRadius:14,padding:"10px 14px",display:"flex",alignItems:"center",gap:8,flex:1,boxShadow:"0 2px 10px rgba(0,0,0,0.06)" }}>
          <span>🔍</span>
          <input value={searchQ} onChange={e=>setSearchQ(e.target.value)} placeholder="Buscar recetas..." style={{ border:"none",outline:"none",flex:1,fontSize:15,fontFamily:"Georgia,serif" }} />
        </div>
        <button onClick={onNew} style={{ background:"#0e7490",color:"white",border:"none",borderRadius:14,padding:"10px 16px",fontSize:20,cursor:"pointer",boxShadow:"0 2px 10px rgba(0,0,0,0.1)" }}>＋</button>
      </div>

      {/* Toggle Todos / Categorías */}
      <div style={{ display:"flex",background:"white",borderRadius:14,padding:4,marginBottom:16,boxShadow:"0 2px 10px rgba(0,0,0,0.06)" }}>
        {["todos","categorias"].map(v=>(
          <button key={v} onClick={()=>switchView(v)} style={{ flex:1,padding:"8px",borderRadius:10,border:"none",background:view===v?"#0e7490":"transparent",color:view===v?"white":"#555",fontSize:14,cursor:"pointer",fontFamily:"Georgia,serif",transition:"all 0.15s" }}>
            {v==="todos"?"📋 Todos":"🗂 Categorías"}
          </button>
        ))}
      </div>

      {/* CATEGORÍAS VIEW */}
      {view==="categorias" && !selectedCat && (
        <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:12 }}>
          {CATEGORIES.map(cat=>{
            const count = countByCat(cat.name);
            return (
              <button key={cat.name} onClick={()=>setSelectedCat(cat.name)}
                style={{ background:"white",borderRadius:20,padding:"24px 12px",boxShadow:"0 2px 12px rgba(0,0,0,0.07)",border:"none",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:10,transition:"transform 0.1s" }}
                onMouseDown={e=>e.currentTarget.style.transform="scale(0.97)"}
                onMouseUp={e=>e.currentTarget.style.transform="scale(1)"}>
                <span style={{ fontSize:48 }}>{cat.emoji}</span>
                <div style={{ fontSize:13,fontWeight:"bold",color:"#1a1a1a",textAlign:"center",lineHeight:1.3 }}>{cat.name}</div>
                <div style={{ fontSize:11,color:count>0?"#0e7490":"#bbb",background:count>0?"#e0f2fe":"#f5f5f5",padding:"3px 10px",borderRadius:10 }}>
                  {count>0?`${count} receta${count>1?"s":""}`:"Sin recetas"}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* CATEGORÍAS: recetas de una categoría */}
      {view==="categorias" && selectedCat && (
        <div>
          <button onClick={()=>setSelectedCat(null)} style={{ background:"none",border:"none",color:"#0e7490",cursor:"pointer",fontSize:14,marginBottom:12,padding:0,display:"flex",alignItems:"center",gap:6 }}>
            ← Volver a categorías
          </button>
          <div style={{ display:"flex",alignItems:"center",gap:10,marginBottom:16 }}>
            <span style={{ fontSize:32 }}>{CATEGORIES.find(c=>c.name===selectedCat)?.emoji}</span>
            <div style={{ fontWeight:"bold",fontSize:18,color:"#1a1a1a" }}>{selectedCat}</div>
          </div>
          <RecipeList recipes={filtered} onSelect={onSelect} addToCart={addToCart} onAddToCalendar={onAddToCalendar} onNew={onNew} />
        </div>
      )}

      {/* TODOS VIEW */}
      {view==="todos" && (
        <RecipeList recipes={filtered} onSelect={onSelect} addToCart={addToCart} onAddToCalendar={onAddToCalendar} onNew={onNew} />
      )}
    </div>
  );
}

// ─── Recipe List (shared between views) ──────────────────────────────────────
function RecipeList({ recipes, onSelect, addToCart, onAddToCalendar, onNew }) {
  return (
    <div style={{ display:"flex",flexDirection:"column",gap:12 }}>
      {recipes.map(recipe=>(
        <div key={recipe.id} style={{ background:"white",borderRadius:18,padding:16,boxShadow:"0 2px 12px rgba(0,0,0,0.07)",cursor:"pointer" }} onClick={()=>onSelect(recipe)}>
          <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center" }}>
            <div style={{ display:"flex",gap:12,flex:1 }}>
              <span style={{ fontSize:40 }}>{recipe.emoji}</span>
              <div style={{ flex:1 }}>
                <div style={{ fontWeight:"bold",fontSize:17,color:"#1a1a1a" }}>{recipe.name}</div>
                <div style={{ fontSize:12,color:"#888",marginTop:2 }}>{recipe.category}</div>
                <div style={{ display:"flex",gap:12,marginTop:8 }}>
                  <span style={{ fontSize:12,color:"#666" }}>⏱ {recipe.time}</span>
                  <span style={{ fontSize:12,color:"#666" }}>👥 {recipe.servings} pers.</span>
                  <span style={{ fontSize:12,color:"#666" }}>🧺 {(recipe.ingredients||[]).length} ing.</span>
                </div>
              </div>
            </div>
            <div style={{ display:"flex",gap:8 }}>
              <button onClick={e=>{e.stopPropagation();addToCart(recipe.ingredients||[],recipe.name);}} style={{ background:"#0e7490",color:"white",border:"none",borderRadius:10,padding:"8px 12px",fontSize:16,cursor:"pointer" }}>🛒</button>
              <button onClick={e=>{e.stopPropagation();onAddToCalendar(recipe);}} style={{ background:"#e8f4fd",color:"#1a6fa8",border:"none",borderRadius:10,padding:"8px 12px",fontSize:16,cursor:"pointer" }}>📅</button>
            </div>
          </div>
        </div>
      ))}
      {recipes.length===0&&(
        <div style={{ textAlign:"center",padding:40,color:"#aaa" }}>
          <div style={{ fontSize:40 }}>🍽</div>
          <div>No hay recetas aquí todavía</div>
          <button onClick={onNew} style={{ marginTop:16,background:"#0e7490",color:"white",border:"none",borderRadius:14,padding:"10px 24px",fontSize:14,cursor:"pointer" }}>+ Crear receta</button>
        </div>
      )}
    </div>
  );
}

// ─── Recipe Modal ─────────────────────────────────────────────────────────────
function RecipeModal({ recipe, onClose, onEdit, onDelete, addToCart, onAddToCalendar }) {
  const ings=(recipe.ingredients||[]).map(parseIng);
  const [confirmDelete,setConfirmDelete]=useState(false);
  return (
    <div style={{ position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:100,display:"flex",alignItems:"flex-end" }}>
      <div style={{ background:"white",borderRadius:"24px 24px 0 0",width:"100%",maxHeight:"90vh",overflowY:"auto",padding:24 }}>
        {/* Header */}
        <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16 }}>
          <div style={{ fontSize:40 }}>{recipe.emoji}</div>
          <button onClick={onClose} style={{ background:"#f5f5f5",border:"none",borderRadius:"50%",width:36,height:36,cursor:"pointer",fontSize:16 }}>✕</button>
        </div>
        <h2 style={{ margin:"0 0 4px",fontSize:24 }}>{recipe.name}</h2>
        <div style={{ color:"#888",fontSize:13,marginBottom:16 }}>{recipe.category}</div>
        <div style={{ display:"flex",gap:12,marginBottom:20,flexWrap:"wrap" }}>
          <div style={{ background:"#e0f2fe",padding:"8px 14px",borderRadius:12,fontSize:13 }}>⏱ {recipe.time}</div>
          <div style={{ background:"#e0f2fe",padding:"8px 14px",borderRadius:12,fontSize:13 }}>👥 {recipe.servings} personas</div>
        </div>
        <h3 style={{ fontSize:16,color:"#333",marginBottom:10 }}>🧺 Ingredientes</h3>
        <div style={{ background:"#f0f9ff",borderRadius:14,padding:14,marginBottom:20 }}>
          {ings.map((ing,i)=>(
            <div key={i} style={{ padding:"8px 0",borderBottom:i<ings.length-1?"1px solid #bae6fd":"none",display:"flex",justifyContent:"space-between",alignItems:"center" }}>
              <span style={{ fontSize:14,color:"#333" }}>• {ing.name}</span>
              {Number(ing.qty)>0&&<span style={{ fontSize:13,color:"#0e7490",fontWeight:"bold",background:"#e0f2fe",padding:"2px 10px",borderRadius:8 }}>{fmtQty(Number(ing.qty))} {ing.unit}</span>}
            </div>
          ))}
        </div>
        <h3 style={{ fontSize:16,color:"#333",marginBottom:10 }}>👩‍🍳 Preparación</h3>
        <div style={{ display:"flex",flexDirection:"column",gap:10,marginBottom:24 }}>
          {(recipe.steps||[]).map((step,i)=>(
            <div key={i} style={{ display:"flex",gap:12,alignItems:"flex-start" }}>
              <div style={{ background:"#0e7490",color:"white",borderRadius:"50%",width:26,height:26,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,flexShrink:0,marginTop:1 }}>{i+1}</div>
              <div style={{ fontSize:14,color:"#444",lineHeight:1.5 }}>{step}</div>
            </div>
          ))}
        </div>
        {/* Action buttons */}
        <div style={{ display:"flex",gap:10,marginBottom:12 }}>
          <button onClick={()=>addToCart(recipe.ingredients||[],recipe.name)} style={{ flex:1,background:"#0e7490",color:"white",border:"none",borderRadius:14,padding:"13px",fontSize:15,cursor:"pointer",fontFamily:"Georgia,serif" }}>🛒 Al carrito</button>
          <button onClick={onAddToCalendar} style={{ flex:1,background:"#e8f4fd",color:"#1a6fa8",border:"none",borderRadius:14,padding:"13px",fontSize:15,cursor:"pointer",fontFamily:"Georgia,serif" }}>📅 Al calendario</button>
        </div>
        <div style={{ display:"flex",gap:10 }}>
          <button onClick={onEdit} style={{ flex:1,background:"#e0f2fe",color:"#0e7490",border:"none",borderRadius:14,padding:"12px",fontSize:15,cursor:"pointer",fontFamily:"Georgia,serif" }}>✏️ Editar</button>
          {!confirmDelete
            ?<button onClick={()=>setConfirmDelete(true)} style={{ flex:1,background:"#fff0f0",color:"#cc3333",border:"none",borderRadius:14,padding:"12px",fontSize:15,cursor:"pointer",fontFamily:"Georgia,serif" }}>🗑 Eliminar</button>
            :<button onClick={onDelete} style={{ flex:1,background:"#cc3333",color:"white",border:"none",borderRadius:14,padding:"12px",fontSize:15,cursor:"pointer",fontFamily:"Georgia,serif" }}>¿Confirmar?</button>
          }
        </div>
      </div>
    </div>
  );
}

// ─── Shopping Tab ─────────────────────────────────────────────────────────────
function ShoppingTab({ shopping, setShopping, showToast }) {
  const [newName,setNewName]=useState("");const [newQty,setNewQty]=useState("");const [newUnit,setNewUnit]=useState("und");
  const toggle=async(item)=>{try{await DB.toggleShoppingItem(item.id,!item.checked);setShopping(s=>s.map(i=>i.id===item.id?{...i,checked:!i.checked}:i));}catch{showToast("Error");}};
  const removeItem=async(id)=>{try{await DB.deleteShoppingItem(id);setShopping(s=>s.filter(i=>i.id!==id));}catch{showToast("Error");}};
  const clearChecked=async()=>{try{await DB.deleteChecked();setShopping(s=>s.filter(i=>!i.checked));showToast("Comprados eliminados ✅");}catch{showToast("Error");}};
  const addItem=async()=>{if(!newName.trim())return;try{const added=await DB.addShoppingItem({name:newName.trim(),qty:newQty?Number(newQty):0,unit:newUnit,checked:false,from_recipe:"Manual"});setShopping(s=>[...s,added[0]]);setNewName("");setNewQty("");}catch{showToast("Error al agregar");}};
  const pending=shopping.filter(i=>!i.checked);const done=shopping.filter(i=>i.checked);
  const byRecipe={};pending.forEach(i=>{(byRecipe[i.from_recipe||"Otros"]=byRecipe[i.from_recipe||"Otros"]||[]).push(i);});
  return (
    <div style={{ paddingTop:16 }}>
      <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16 }}>
        <div style={{ fontSize:18,fontWeight:"bold",color:"#1a1a1a" }}>🛒 Lista de Compras</div>
        {done.length>0&&<button onClick={clearChecked} style={{ background:"#fff0f0",color:"#cc3333",border:"none",borderRadius:10,padding:"6px 12px",fontSize:12,cursor:"pointer" }}>Limpiar comprados</button>}
      </div>
      <div style={{ background:"white",borderRadius:14,padding:"12px 14px",marginBottom:20,boxShadow:"0 2px 10px rgba(0,0,0,0.06)" }}>
        <div style={{ fontSize:12,color:"#888",marginBottom:8 }}>Agregar artículo manual</div>
        <div style={{ display:"flex",gap:6,alignItems:"center" }}>
          <input value={newName} onChange={e=>setNewName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addItem()} placeholder="Nombre..." style={{ flex:2,border:"2px solid #bae6fd",borderRadius:10,padding:"8px 10px",fontSize:14,fontFamily:"Georgia,serif",outline:"none",minWidth:0 }} />
          <input type="number" min="0" step="any" value={newQty} onChange={e=>setNewQty(e.target.value)} placeholder="Cant." style={{ width:58,border:"2px solid #bae6fd",borderRadius:10,padding:"8px 6px",fontSize:13,fontFamily:"Georgia,serif",outline:"none",textAlign:"center" }} />
          <select value={newUnit} onChange={e=>setNewUnit(e.target.value)} style={{ border:"2px solid #bae6fd",borderRadius:10,padding:"8px 4px",fontSize:12,outline:"none",background:"white" }}>{UNITS.map(u=><option key={u} value={u}>{u}</option>)}</select>
          <button onClick={addItem} style={{ background:"#0e7490",color:"white",border:"none",borderRadius:10,padding:"8px 12px",cursor:"pointer",flexShrink:0 }}>➕</button>
        </div>
      </div>
      {Object.keys(byRecipe).length===0&&done.length===0&&(<div style={{ textAlign:"center",padding:40,color:"#aaa" }}><div style={{ fontSize:40 }}>🧺</div><div>La lista está vacía</div></div>)}
      {Object.entries(byRecipe).map(([recipeName,items])=>(
        <div key={recipeName} style={{ marginBottom:16 }}>
          <div style={{ fontSize:12,color:"#888",letterSpacing:1,textTransform:"uppercase",marginBottom:8,paddingLeft:4 }}>{recipeName}</div>
          <div style={{ background:"white",borderRadius:14,overflow:"hidden",boxShadow:"0 2px 10px rgba(0,0,0,0.06)" }}>
            {items.map((item,idx)=>(
              <div key={item.id} style={{ display:"flex",alignItems:"center",padding:"12px 14px",borderBottom:idx<items.length-1?"1px solid #f0ece5":"none" }}>
                <button onClick={()=>toggle(item)} style={{ width:22,height:22,borderRadius:6,border:"2px solid #0e7490",background:"white",cursor:"pointer",marginRight:12,flexShrink:0 }} />
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:14,color:"#333" }}>{item.name}</div>
                  {Number(item.qty)>0&&<div style={{ fontSize:12,color:"#0e7490",fontWeight:"bold",marginTop:1 }}>{fmtQty(Number(item.qty))} {item.unit}</div>}
                </div>
                <button onClick={()=>removeItem(item.id)} style={{ background:"none",border:"none",color:"#ccc",cursor:"pointer",fontSize:16,padding:"0 4px" }}>×</button>
              </div>
            ))}
          </div>
        </div>
      ))}
      {done.length>0&&(
        <div style={{ marginTop:16 }}>
          <div style={{ fontSize:12,color:"#aaa",letterSpacing:1,textTransform:"uppercase",marginBottom:8,paddingLeft:4 }}>Comprados ({done.length})</div>
          <div style={{ background:"#fafafa",borderRadius:14,overflow:"hidden" }}>
            {done.map((item,idx)=>(
              <div key={item.id} style={{ display:"flex",alignItems:"center",padding:"10px 14px",borderBottom:idx<done.length-1?"1px solid #f0f0f0":"none" }}>
                <button onClick={()=>toggle(item)} style={{ width:22,height:22,borderRadius:6,border:"none",background:"#0e7490",cursor:"pointer",marginRight:12,flexShrink:0,color:"white",fontSize:13 }}>✓</button>
                <span style={{ flex:1,fontSize:14,textDecoration:"line-through",color:"#bbb" }}>{item.name}{Number(item.qty)>0?" — "+fmtQty(Number(item.qty))+" "+item.unit:""}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Calendar Tab ─────────────────────────────────────────────────────────────
function CalendarTab({ calendar, setCalendar, recipes, showToast, onAddMeal }) {
  const today=new Date();
  const [currentMonth,setCurrentMonth]=useState(today.getMonth());
  const [currentYear,setCurrentYear]=useState(today.getFullYear());
  const [selectedDay,setSelectedDay]=useState(null);
  const [showPicker,setShowPicker]=useState(null);
  const [pickerSearch,setPickerSearch]=useState("");

  const firstDay=new Date(currentYear,currentMonth,1).getDay();
  const daysInMonth=new Date(currentYear,currentMonth+1,0).getDate();
  const getDateKey=(day)=>`${currentYear}-${String(currentMonth+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
  const getDayMeals=(day)=>{const r={};calendar.filter(e=>e.date===getDateKey(day)).forEach(e=>{r[e.slot]=e;});return r;};

  const setMeal=async(day,slot,recipe)=>{
    try{await onAddMeal(getDateKey(day),slot,recipe);setShowPicker(null);setPickerSearch("");showToast(`${recipe.name} → ${slot} 📅`);}
    catch{showToast("Error al guardar");}
  };
  const removeMeal=async(day,slot)=>{try{await DB.deleteMeal(getDateKey(day),slot);setCalendar(c=>c.filter(e=>!(e.date===getDateKey(day)&&e.slot===slot)));}catch{showToast("Error");}};

  const dayMeals=selectedDay?getDayMeals(selectedDay):{};
  const filteredRecipes=recipes.filter(r=>r.name.toLowerCase().includes(pickerSearch.toLowerCase()));

  return (
    <div style={{ paddingTop:16 }}>
      <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16 }}>
        <button onClick={()=>{if(currentMonth===0){setCurrentMonth(11);setCurrentYear(y=>y-1);}else setCurrentMonth(m=>m-1);}} style={{ background:"white",border:"none",borderRadius:10,padding:"8px 14px",cursor:"pointer",fontSize:16 }}>‹</button>
        <div style={{ fontWeight:"bold",fontSize:17 }}>{MONTHS[currentMonth]} {currentYear}</div>
        <button onClick={()=>{if(currentMonth===11){setCurrentMonth(0);setCurrentYear(y=>y+1);}else setCurrentMonth(m=>m+1);}} style={{ background:"white",border:"none",borderRadius:10,padding:"8px 14px",cursor:"pointer",fontSize:16 }}>›</button>
      </div>
      <div style={{ background:"white",borderRadius:18,padding:16,boxShadow:"0 2px 12px rgba(0,0,0,0.07)",marginBottom:16 }}>
        <div style={{ display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:4,marginBottom:8 }}>
          {["D","L","M","M","J","V","S"].map((d,i)=><div key={i} style={{ textAlign:"center",fontSize:11,color:"#999",fontWeight:"bold" }}>{d}</div>)}
        </div>
        <div style={{ display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:4 }}>
          {Array(firstDay).fill(null).map((_,i)=><div key={"e"+i}/>)}
          {Array(daysInMonth).fill(null).map((_,i)=>{
            const day=i+1,hasMeals=Object.keys(getDayMeals(day)).length>0,isToday=day===today.getDate()&&currentMonth===today.getMonth()&&currentYear===today.getFullYear(),isSelected=selectedDay===day;
            return <button key={day} onClick={()=>setSelectedDay(selectedDay===day?null:day)} style={{ aspectRatio:"1",borderRadius:10,border:"none",background:isSelected?"#0e7490":isToday?"#e0f2fe":"transparent",color:isSelected?"white":isToday?"#0e7490":"#333",cursor:"pointer",fontSize:13,fontWeight:isToday?"bold":"normal",display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column" }}>
              {day}{hasMeals&&<div style={{ width:4,height:4,borderRadius:"50%",background:isSelected?"rgba(255,255,255,0.7)":"#0e7490",marginTop:1 }}/>}
            </button>;
          })}
        </div>
      </div>

      {selectedDay&&(
        <div style={{ background:"white",borderRadius:18,padding:16,boxShadow:"0 2px 12px rgba(0,0,0,0.07)" }}>
          <div style={{ fontWeight:"bold",fontSize:16,marginBottom:14,color:"#333" }}>📅 {selectedDay} de {MONTHS[currentMonth]}</div>
          {SLOTS.map(slot=>(
            <div key={slot} style={{ marginBottom:12 }}>
              <div style={{ fontSize:12,color:"#888",textTransform:"capitalize",marginBottom:6 }}>{SLOT_EMOJI[slot]} {slot.charAt(0).toUpperCase()+slot.slice(1)}</div>
              {dayMeals[slot]
                ?<div style={{ background:"#e0f2fe",borderRadius:12,padding:"10px 14px",display:"flex",justifyContent:"space-between",alignItems:"center" }}>
                  <span style={{ fontSize:14 }}>{dayMeals[slot].recipe_emoji} {dayMeals[slot].recipe_name}</span>
                  <button onClick={()=>removeMeal(selectedDay,slot)} style={{ background:"none",border:"none",color:"#aaa",cursor:"pointer",fontSize:16 }}>×</button>
                </div>
                :<button onClick={()=>{setShowPicker(slot);setPickerSearch("");}} style={{ width:"100%",background:"#f0f9ff",border:"2px dashed #bae6fd",borderRadius:12,padding:"10px",fontSize:13,color:"#aaa",cursor:"pointer" }}>+ Agregar receta</button>
              }
            </div>
          ))}
        </div>
      )}

      {/* Recipe picker with search */}
      {showPicker&&(
        <div style={{ position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:100,display:"flex",alignItems:"flex-end" }}>
          <div style={{ background:"white",borderRadius:"24px 24px 0 0",width:"100%",maxHeight:"70vh",display:"flex",flexDirection:"column" }}>
            <div style={{ padding:"20px 24px 12px" }}>
              <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12 }}>
                <div style={{ fontWeight:"bold",fontSize:16 }}>{SLOT_EMOJI[showPicker]} Elegir para {showPicker}</div>
                <button onClick={()=>{setShowPicker(null);setPickerSearch("");}} style={{ background:"none",border:"none",fontSize:18,cursor:"pointer" }}>✕</button>
              </div>
              {/* Search bar */}
              <div style={{ background:"#f5f5f5",borderRadius:12,padding:"8px 14px",display:"flex",alignItems:"center",gap:8 }}>
                <span style={{ fontSize:14 }}>🔍</span>
                <input value={pickerSearch} onChange={e=>setPickerSearch(e.target.value)} placeholder="Buscar receta..." autoFocus style={{ border:"none",outline:"none",flex:1,fontSize:14,fontFamily:"Georgia,serif",background:"transparent" }} />
                {pickerSearch&&<button onClick={()=>setPickerSearch("")} style={{ background:"none",border:"none",color:"#aaa",cursor:"pointer",fontSize:16 }}>×</button>}
              </div>
            </div>
            <div style={{ overflowY:"auto",padding:"0 24px 24px" }}>
              {filteredRecipes.length===0&&<div style={{ textAlign:"center",padding:30,color:"#aaa" }}>No se encontraron recetas</div>}
              {filteredRecipes.map(recipe=>(
                <div key={recipe.id} onClick={()=>setMeal(selectedDay,showPicker,recipe)} style={{ display:"flex",gap:12,padding:"12px 0",borderBottom:"1px solid #f0ece5",cursor:"pointer",alignItems:"center" }}>
                  <span style={{ fontSize:28 }}>{recipe.emoji}</span>
                  <div style={{ flex:1 }}>
                    <div style={{ fontWeight:"bold",fontSize:14 }}>{recipe.name}</div>
                    <div style={{ fontSize:12,color:"#999" }}>{recipe.time} · {recipe.category}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── AI Tab ───────────────────────────────────────────────────────────────────
function AITab({ recipes, setRecipes, showToast, onDone }) {
  const [aiPrompt,setAiPrompt]=useState("");const [aiLoading,setAiLoading]=useState(false);
  const suggestions=["Pollo al curry con arroz","Crème brûlée","Papas a la crema","Ceviche de camarones","Risotto de hongos"];
  const generate=async()=>{
    if(!aiPrompt.trim())return;setAiLoading(true);
    try{
      const res=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:1000,messages:[{role:"user",content:`Genera una receta para: "${aiPrompt}". Responde SOLO con JSON válido sin backticks. Campos: name, emoji (1 emoji), time, servings (número), category, ingredients (array de objetos {name, qty (número), unit (uno de: und,g,kg,ml,L,taza,cdta,cda)}), steps (array de strings).`}]})});
      const json=await res.json();const text=json.content?.find(b=>b.type==="text")?.text||"";
      const recipe=JSON.parse(text.replace(/```json|```/g,"").trim());
      const saved=await DB.addRecipe(recipe);setRecipes(r=>[...r,saved[0]]);setAiPrompt("");showToast(`¡"${recipe.name}" guardada! ✨`);onDone();
    }catch{showToast("Error al generar. Intentá de nuevo.");}
    setAiLoading(false);
  };
  return (
    <div style={{ paddingTop:16 }}>
      <div style={{ background:"linear-gradient(135deg,#0e7490,#0e7490)",borderRadius:20,padding:20,color:"white",marginBottom:20 }}>
        <div style={{ fontSize:32,marginBottom:8 }}>✨</div>
        <div style={{ fontSize:20,fontWeight:"bold",marginBottom:6 }}>Chef IA</div>
        <div style={{ fontSize:14,opacity:0.85 }}>Describí un plato y te genero la receta completa con ingredientes estructurados.</div>
      </div>
      <div style={{ background:"white",borderRadius:16,padding:16,boxShadow:"0 2px 12px rgba(0,0,0,0.07)",marginBottom:16 }}>
        <textarea value={aiPrompt} onChange={e=>setAiPrompt(e.target.value)} placeholder="Ej: Crème brûlée para 4 personas..." style={{ width:"100%",border:"none",outline:"none",fontSize:15,fontFamily:"Georgia,serif",resize:"none",minHeight:80,color:"#333",boxSizing:"border-box" }} />
        <button onClick={generate} disabled={aiLoading||!aiPrompt.trim()} style={{ width:"100%",background:aiLoading?"#aaa":"#0e7490",color:"white",border:"none",borderRadius:14,padding:14,fontSize:16,cursor:aiLoading?"default":"pointer",fontFamily:"Georgia,serif",marginTop:8 }}>
          {aiLoading?"⏳ Generando...":"✨ Generar y guardar receta"}
        </button>
      </div>
      <div style={{ marginBottom:8,fontSize:13,color:"#888" }}>Sugerencias:</div>
      <div style={{ display:"flex",flexDirection:"column",gap:8 }}>
        {suggestions.map(s=><button key={s} onClick={()=>setAiPrompt(s)} style={{ background:"white",border:"1px solid #bae6fd",borderRadius:12,padding:"12px 16px",fontSize:14,textAlign:"left",cursor:"pointer",color:"#444" }}>🍽 {s}</button>)}
      </div>
    </div>
  );
}

// ─── Share Modal ──────────────────────────────────────────────────────────────
function ShareModal({ onClose }) {
  const [copied,setCopied]=useState(false);
  const url="https://recetapp-kappa.vercel.app";
  const copy=()=>{navigator.clipboard.writeText(url).then(()=>{setCopied(true);setTimeout(()=>setCopied(false),2000);});};
  return (
    <div style={{ position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:24 }}>
      <div style={{ background:"white",borderRadius:24,padding:28,width:"100%",maxWidth:360 }}>
        <div style={{ textAlign:"center",marginBottom:20 }}>
          <div style={{ fontSize:48 }}>🔗</div>
          <h2 style={{ margin:"8px 0 4px",fontSize:22 }}>Compartir RecetApp</h2>
          <p style={{ color:"#888",fontSize:14,margin:0 }}>Cualquier persona con este link ve los mismos datos en tiempo real.</p>
        </div>
        <div style={{ background:"#e0f2fe",borderRadius:16,padding:16,marginBottom:16,wordBreak:"break-all",fontSize:14,color:"#0e7490",fontWeight:"bold",textAlign:"center" }}>recetapp-kappa.vercel.app</div>
        <button onClick={copy} style={{ width:"100%",background:copied?"#0e7490":"#e0f2fe",color:copied?"white":"#0e7490",border:"none",borderRadius:14,padding:14,fontSize:15,cursor:"pointer",marginBottom:10,fontFamily:"Georgia,serif" }}>{copied?"✅ Link copiado!":"📋 Copiar link"}</button>
        <button onClick={onClose} style={{ width:"100%",background:"#f5f5f5",border:"none",borderRadius:14,padding:14,fontSize:15,cursor:"pointer",fontFamily:"Georgia,serif" }}>Cerrar</button>
      </div>
    </div>
  );
}
