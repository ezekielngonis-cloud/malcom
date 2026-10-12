import { db, ready, setupHint } from "./client.js";
const $=id=>document.getElementById(id);let user=null,profile=null,products=[],mode="login",timer,currentPage="home";

function showPage(page) {
  const valid = ["home", "market", "sell", "orders", "account", "settings", "support"];
  if (!valid.includes(page)) page = "home";
  currentPage = page;
  document.querySelectorAll("[data-page-view]").forEach(view => {
    const active = view.dataset.pageView === page;
    view.classList.toggle("active", active);
    view.hidden = !active;
  });
  document.querySelectorAll("[data-page]").forEach(button => {
    const active = button.dataset.page === page;
    button.classList.toggle("active", active);
    if (button.hasAttribute("aria-current")) button.setAttribute("aria-current", active ? "page" : "false");
  });
  document.body.classList.remove("mobile-menu-open");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function showWelcome() {
  $("welcomeScreen").hidden = false;
  $("appShell").hidden = true;
  $("welcomeYear").textContent = new Date().getFullYear();
}

function showAppShell() {
  $("welcomeScreen").hidden = true;
  $("appShell").hidden = false;
  showPage(currentPage || "home");
}

function openAuthDialog(authType) {
  if (!db) {
    toast(setupHint);
    return;
  }

  authMode(authType);

  const dialog = $("authDialog");
  if (!dialog.open) {
    dialog.showModal();
  }
}

const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const money=v=>"$"+Number(v||0).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2});
function toast(m){$("toast").textContent=m;$("toast").classList.add("show");clearTimeout(timer);timer=setTimeout(()=>$("toast").classList.remove("show"),3200)}
function msg(id,m,bad=false){$(id).textContent=m;$(id).style.color=bad?"#b91c1c":""}
function err(e){console.error(e);return e?.message||"Something went wrong."}
function configCheck(){if(!db){toast(setupHint);return false}return true}
async function profileLoad(){profile=null;if(!user)return;const {data,error}=await db.from("profiles").select("id,full_name,role,created_at").eq("id",user.id).maybeSingle();if(error)throw error;profile=data}
function identity(){ $("identity").textContent=user?(profile?.full_name||user.email):"Browsing as guest";$("authBtn").textContent=user?"Sign out":"Sign in"}
async function sessionLoad() {
  if (!db) {
    showWelcome();
    return;
  }

  const { data, error } = await db.auth.getSession();

  if (error) {
    showWelcome();
    throw error;
  }

  user = data.session?.user || null;

  if (!user) {
    profile = null;
    products = [];
    showWelcome();
    return;
  }

  showAppShell();

  try {
    await profileLoad();
  } catch (e) {
    console.error(e);
  }

  identity();

  await Promise.all([
    loadProducts(),
    loadOrders(),
    loadAccount()
  ]);
}

async function loadProducts(){if(!db){$("listStatus").textContent="Setup required";$("cards").innerHTML=`<div class="empty">${esc(setupHint)}</div>`;return}
const {data,error}=await db.from("listings").select("id,title,category,condition,price,quantity,location,description,image_url,seller_id,created_at,status,profiles:profiles!listings_seller_id_fkey(full_name)").eq("status","active").order("created_at",{ascending:false}).limit(300);
if(error){$("listStatus").textContent=err(error);return}products=data||[];$("count").textContent=products.length+" listings";renderProducts()}
function productCardHTML(p) {
  return `<article class="product"><div class="photo">${p.image_url?`<img loading="lazy" src="${esc(p.image_url)}" alt="${esc(p.title)}">`:"▧"}</div><div class="body"><div class="eyebrow">${esc(p.category)} · ${esc(p.condition)}</div><h3>${esc(p.title)}</h3><div class="price">${money(p.price)}</div><p class="muted">${Number(p.quantity)} available · ${esc(p.location||"Zimbabwe")}</p><p class="muted">${esc((p.description||"No description provided.").slice(0,130))}</p><p class="muted">Seller: ${esc(p.profiles?.full_name||"Member")}</p><div class="row"><button class="btn light" data-detail="${p.id}">Details</button><button class="btn gold" data-order="${p.id}">Order</button></div>${user&&p.seller_id===user.id?`<button class="btn danger" style="margin-top:8px" data-delete="${p.id}">Delete listing</button>`:""}</div></article>`;
}
function bindProductCards(container) {
  if (!container) return;
  container.querySelectorAll("[data-detail]").forEach(b=>b.onclick=()=>{let p=products.find(x=>x.id===b.dataset.detail);if(!p)return;alert(`${p.title}\n${money(p.price)}\n${p.category} · ${p.condition}\n${p.location||"Zimbabwe"}\n\n${p.description||"No description"}\n\nSeller: ${p.profiles?.full_name||"Member"}\n\nVerify the item and seller before paying.`)});
  container.querySelectorAll("[data-order]").forEach(b=>b.onclick=()=>placeOrder(b.dataset.order));
  container.querySelectorAll("[data-delete]").forEach(b=>b.onclick=()=>deleteListing(b.dataset.delete));
}
function renderProducts(){
  const q=$("search").value.trim().toLowerCase(),cat=$("category").value,sort=$("sort").value;
  let list=products.filter(p=>(!cat||p.category===cat)&&[p.title,p.category,p.description,p.location,p.profiles?.full_name].some(v=>String(v||"").toLowerCase().includes(q)));
  if(sort==="low")list.sort((a,b)=>a.price-b.price);
  if(sort==="high")list.sort((a,b)=>b.price-a.price);
  if(sort==="new")list.sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
  $("listStatus").textContent=list.length+" results";
  const cards=$("cards");
  cards.innerHTML=list.length?list.map(productCardHTML).join(""):'<div class="empty">No listings found. Try another search.</div>';
  bindProductCards(cards);
  renderHomeProducts();
}
function renderHomeProducts(){
  const target=$("homeCards");
  if(!target)return;
  const q=$("homeSearch").value.trim().toLowerCase(),cat=$("homeCategory").value;
  const list=products.filter(p=>(!cat||p.category===cat)&&[p.title,p.category,p.description,p.location,p.profiles?.full_name].some(v=>String(v||"").toLowerCase().includes(q))).slice(0,6);
  target.innerHTML=list.length?list.map(productCardHTML).join(""):'<div class="empty">No featured listings match. Try another search or visit the marketplace.</div>';
  bindProductCards(target);
}
async function placeOrder(id){if(!user){openAuthDialog("login");toast("Sign in before ordering.");return}let p=products.find(x=>x.id===id);if(!p)return;if(p.seller_id===user.id)return toast("You cannot order your own listing.");let val=prompt(`Quantity requested (available: ${p.quantity})`,"1");if(val===null)return;let quantity=Number(val);if(!Number.isInteger(quantity)||quantity<1||quantity>p.quantity)return toast("Enter a valid quantity.");const {error}=await db.from("orders").insert({listing_id:p.id,buyer_id:user.id,seller_id:p.seller_id,quantity,unit_price:p.price,total_price:p.price*quantity,status:"pending"});if(error)return toast(err(error));toast("Order request sent. No payment was taken.");await loadOrders()}
async function deleteListing(id){if(!user||!confirm("Delete this listing?"))return;let {error}=await db.from("listings").delete().eq("id",id).eq("seller_id",user.id);if(error)return toast(err(error));toast("Listing deleted.");await loadProducts();await loadAccount()}
async function loadOrders(){if(!db||!user){$("ordersContent").innerHTML='<div class="empty">Sign in to view orders.</div>';return}let {data,error}=await db.from("orders").select("id,quantity,total_price,status,created_at,buyer_id,seller_id,listings(title)").or(`buyer_id.eq.${user.id},seller_id.eq.${user.id}`).order("created_at",{ascending:false});if(error){$("ordersContent").textContent=err(error);return}if(!data?.length){$("ordersContent").innerHTML='<div class="empty">No order requests yet.</div>';return}
$("ordersContent").innerHTML=`<div class="tablewrap"><table><thead><tr><th>Item</th><th>Qty</th><th>Total</th><th>Role</th><th>Status</th><th>Action</th></tr></thead><tbody>${data.map(o=>{let seller=o.seller_id===user.id,act=seller&&o.status==="pending"?`<button class="btn" data-status="${o.id}" data-value="accepted">Accept</button> <button class="btn danger" data-status="${o.id}" data-value="rejected">Reject</button>`:seller&&o.status==="accepted"?`<button class="btn gold" data-status="${o.id}" data-value="completed">Complete</button>`:"—";return `<tr><td>${esc(o.listings?.title||"Listing")}<br><small>${new Date(o.created_at).toLocaleDateString()}</small></td><td>${o.quantity}</td><td>${money(o.total_price)}</td><td>${seller?"Seller":"Buyer"}</td><td>${esc(o.status)}</td><td>${act}</td></tr>`}).join("")}</tbody></table></div>`;
$("ordersContent").querySelectorAll("[data-status]").forEach(b=>b.onclick=async()=>{let {error}=await db.from("orders").update({status:b.dataset.value}).eq("id",b.dataset.status);if(error)toast(err(error));else{toast("Order updated.");loadOrders()}})}
async function loadAccount(){if(!db||!user){$("accountContent").textContent="Browsing as guest."; $("myListings").textContent="Sign in to manage listings.";return}$("settingsName").value=profile?.full_name||user.user_metadata?.full_name||"";$("settingsEmail").value=user.email||"";$("accountContent").innerHTML=`<p><strong>${esc(profile?.full_name||user.email)}</strong><br>${esc(user.email||"")}</p><button class="btn light" id="inlineOut">Sign out</button>`;$("inlineOut").onclick=signOut;
let {data,error}=await db.from("listings").select("id,title,price,quantity,status").eq("seller_id",user.id).order("created_at",{ascending:false});if(error){$("myListings").textContent=err(error);return}if(!data?.length){$("myListings").innerHTML='<div class="empty">You have not published any listings yet.</div>';return}
$("myListings").innerHTML=`<div class="tablewrap"><table><thead><tr><th>Listing</th><th>Price</th><th>Stock</th><th>Status</th><th></th></tr></thead><tbody>${data.map(p=>`<tr><td>${esc(p.title)}</td><td>${money(p.price)}</td><td>${p.quantity}</td><td>${esc(p.status)}</td><td><button class="btn danger" data-own="${p.id}">Delete</button></td></tr>`).join("")}</tbody></table></div>`;$("myListings").querySelectorAll("[data-own]").forEach(b=>b.onclick=()=>deleteListing(b.dataset.own))}

async function signOut() {
  if (!db) return;

  const { error } = await db.auth.signOut();

  if (error) {
    toast(err(error));
    return;
  }

  user = null;
  profile = null;
  products = [];

  showWelcome();
  toast("Signed out successfully.");
}

function authMode(m){mode=m;$("resendConfirmation").hidden=true;$("nameWrap").classList.toggle("hide",m!=="signup");$("authName").required=m==="signup";$("authSubmit").textContent=m==="signup"?"Create account":"Sign in";msg("authMsg","")}
$("welcomeSignIn").addEventListener("click", () => {
  openAuthDialog("login");
});

$("welcomeSignUp").addEventListener("click", () => {
  openAuthDialog("signup");
});

$("authForm").addEventListener("submit", async e => {
  e.preventDefault();

  if (!configCheck()) return;

  const submitButton = $("authSubmit");
  submitButton.disabled = true;
  msg("authMsg", "Working…");
  $("resendConfirmation").hidden = true;

  try {
    const email = $("authEmail").value.trim();
    const password = $("authPassword").value;

    let result;

    if (mode === "signup") {
      result = await db.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: $("authName").value.trim()
          },
          emailRedirectTo: new URL("./", window.location.href).href
        }
      });
    } else {
      result = await db.auth.signInWithPassword({
        email,
        password
      });
    }

    if (result.error) {
      msg("authMsg", err(result.error), true);
      return;
    }

    if (mode === "signup" && !result.data.session) {
      msg(
        "authMsg",
        "Your account request was received. Check your inbox and spam folder for the confirmation email. If it does not arrive, use the resend button below or contact support."
      );
      $("resendConfirmation").hidden = false;
      return;
    }

    $("authDialog").close();

    await sessionLoad();

    if (user) {
      toast("Signed in successfully.");
    } else {
      showWelcome();
      toast("Please sign in to continue.");
    }
  } catch (error) {
    msg("authMsg", err(error), true);
  } finally {
    submitButton.disabled = false;
  }
});

$("listingForm").addEventListener("submit",async e=>{e.preventDefault();if(!configCheck())return;if(!user){$("authDialog").showModal();return toast("Sign in before publishing.")}msg("listingMsg","Publishing…");let file=$("photo").files[0],image_url=null;if(file){if(!["image/jpeg","image/png","image/webp"].includes(file.type)||file.size>5*1024*1024)return msg("listingMsg","Use JPG, PNG or WebP under 5 MB.",true);let ext=file.type==="image/png"?"png":file.type==="image/webp"?"webp":"jpg",path=`${user.id}/${crypto.randomUUID()}.${ext}`;let up=await db.storage.from("listing-images").upload(path,file,{contentType:file.type});if(up.error)return msg("listingMsg",err(up.error),true);image_url=db.storage.from("listing-images").getPublicUrl(path).data.publicUrl}
let price=Number($("price").value),quantity=Number($("qty").value);if(!Number.isFinite(price)||price<=0||!Number.isInteger(quantity)||quantity<1)return msg("listingMsg","Check price and quantity.",true);
let {error}=await db.from("listings").insert({seller_id:user.id,title:$("title").value.trim(),category:$("newCategory").value,condition:$("condition").value,price,quantity,location:$("location").value.trim()||null,description:$("description").value.trim()||null,image_url,status:"active"});if(error)return msg("listingMsg",err(error),true);e.target.reset();$("qty").value=1;msg("listingMsg","Published.");toast("Listing is live.");await Promise.all([loadProducts(),loadAccount()]);showPage("market")});
$("supportForm").addEventListener("submit",async e=>{e.preventDefault();if(!configCheck())return;msg("supportMsg","Sending…");let {error}=await db.from("support_messages").insert({user_id:user?.id||null,name:$("supportName").value.trim(),contact:$("supportContact").value.trim()||null,message:$("supportMessage").value.trim()});if(error)return msg("supportMsg",err(error),true);e.target.reset();msg("supportMsg","Message sent to support.");toast("Support message sent.")});
$("search").addEventListener("input",renderProducts);$("category").addEventListener("change",renderProducts);$("sort").addEventListener("change",renderProducts);$("authBtn").onclick = () => {
  if (user) {
    signOut();
  } else {
    openAuthDialog("login");
  }
};$("closeAuth").onclick=()=>$("authDialog").close();$("loginTab").onclick=()=>authMode("login");$("signupTab").onclick=()=>authMode("signup");$("year").textContent=new Date().getFullYear();

document.querySelectorAll("[data-page]").forEach(button => {
  button.addEventListener("click", () => showPage(button.dataset.page));
});
$("sidebarToggle").addEventListener("click", () => {
  if (window.matchMedia("(max-width: 600px)").matches) {
    document.body.classList.toggle("mobile-menu-open");
  } else {
    document.body.classList.toggle("sidebar-collapsed");
  }
});
$("sidebarSignOut").addEventListener("click", signOut);
$("homeSearch").addEventListener("input", renderHomeProducts);
$("homeCategory").addEventListener("change", renderHomeProducts);
$("settingsForm").addEventListener("submit", async e => {
  e.preventDefault();
  if (!configCheck()) return;
  if (!user) { openAuthDialog("login"); return; }
  const name = $("settingsName").value.trim();
  if (!name) { msg("settingsMsg", "Enter a display name.", true); return; }
  msg("settingsMsg", "Saving…");
  const authUpdate = await db.auth.updateUser({ data: { full_name: name } });
  if (authUpdate.error) { msg("settingsMsg", err(authUpdate.error), true); return; }
  const profileUpdate = await db.from("profiles").update({ full_name: name }).eq("id", user.id);
  if (profileUpdate.error) { msg("settingsMsg", err(profileUpdate.error), true); return; }
  await profileLoad(); identity(); await loadAccount();
  msg("settingsMsg", "Profile settings saved."); toast("Settings updated.");
});
$("resetPasswordBtn").addEventListener("click", async () => {
  if (!configCheck()) return;
  const email = user?.email || $("authEmail").value.trim();
  if (!email) { msg("securityMsg", "Sign in first so we know which email to use.", true); return; }
  msg("securityMsg", "Sending password reset link…");
  const { error } = await db.auth.resetPasswordForEmail(email, { redirectTo: new URL("./", window.location.href).href });
  if (error) { msg("securityMsg", err(error), true); return; }
  msg("securityMsg", "If the email is registered, a password reset link has been sent. Check your inbox and spam folder.");
});
$("resendConfirmation").addEventListener("click", async () => {
  const email = $("authEmail").value.trim();
  if (!email) { msg("authMsg", "Enter your email address first.", true); return; }
  const button = $("resendConfirmation"); button.disabled = true;
  msg("authMsg", "Requesting another confirmation email…");
  try {
    const { error } = await db.auth.resend({ type: "signup", email, options: { emailRedirectTo: new URL("./", window.location.href).href } });
    if (error) { msg("authMsg", err(error), true); return; }
    msg("authMsg", "If the account is awaiting confirmation, another email should arrive shortly. Check spam too.");
  } catch (error) { msg("authMsg", err(error), true); }
  finally { button.disabled = false; }
});

showWelcome();
showPage("home");
$("welcomeYear").textContent = new Date().getFullYear();

if (!db) {
  $("listStatus").textContent = "Setup required";
  $("cards").innerHTML =
    `<div class="empty">${esc(setupHint)}</div>`;

  $("welcomeSignIn").onclick = () => toast(setupHint);
  $("welcomeSignUp").onclick = () => toast(setupHint);
  $("authBtn").onclick = () => toast(setupHint);
} else {
  db.auth.onAuthStateChange(() => {
    setTimeout(() => {
      sessionLoad().catch(e => toast(err(e)));
    }, 0);
  });

  sessionLoad().catch(e => toast(err(e)));
}
