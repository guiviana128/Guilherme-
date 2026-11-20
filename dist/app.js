const $ = selector => document.querySelector(selector);
const storageKey = 'viaana.records.v1';
const sessionKey = 'viaana.session.v1';
const paths = {
  inicio:'M3 11l9-8 9 8v10h-6v-7H9v7H3z',
  agenda:'M4 6h16v15H4zM4 10h16M8 3v5m8-5v5m-8 7h3m2 0h3',
  notas:'M5 3h12l2 2v16H5zM8 8h8m-8 4h8m-8 4h5',
  som:'M9 18V6l11-3v12M9 8l11-3M9 17a3 2 0 1 1-6 0 3 2 0 1 1 6 0zm11-2a3 2 0 1 1-6 0 3 2 0 1 1 6 0z',
  compras:'M4 8h16l-1 13H5zM9 10V6a3 3 0 0 1 6 0v4'
};
const icon = key => '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="' + paths[key] + '"/></svg>';
const sections = {
  agenda: {label:'Agenda', heading:'Agenda', action:'Novo lembrete', empty:'Sem lembretes por aqui.', fields:[['title','Lembrete','text',true],['date','Data e hora','datetime-local',true],['detail','Detalhes','textarea']]},
  notas: {label:'Notas', heading:'Notas da faculdade', action:'Nova nota', empty:'Adicione a primeira prova, trabalho ou anotação.', fields:[['title','Matéria','text',true],['detail','Avaliação ou anotação','textarea'],['grade','Nota de 0 a 10','number',false,'min="0" max="10" step="0.01"']]},
  som: {label:'Som', heading:'Mais ouvidas', action:'Nova faixa', empty:'Adicione uma faixa e registre suas reproduções.', fields:[['title','Faixa','text',true],['detail','Artista','text'],['plays','Reproduções','number',true,'min="0" step="1"']]},
  compras: {label:'Compras', heading:'Lista de compras', action:'Novo item', empty:'Adicione algo que você quer comprar.', fields:[['title','Item','text',true],['price','Preço em reais','number',false,'min="0" step="0.01"'],['detail','Detalhes','textarea']]}
};
const labels = {inicio:'Início', ...Object.fromEntries(Object.entries(sections).map(([key,value]) => [key,value.label]))};
const dateFormat = new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short'});
const money = new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'});
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const initial = () => Object.fromEntries(Object.keys(sections).map(key => [key,[]]));
let records = read();
let editContext;
let installEvent;
let worker;
let checking = false;
function read() {
  try { return {...initial(), ...JSON.parse(localStorage.getItem(storageKey) || '{}')}; }
  catch { return initial(); }
}
function save(change) {
  const next = read();
  change(next);
  try { localStorage.setItem(storageKey,JSON.stringify(next)); }
  catch { say('O aparelho não conseguiu salvar. Verifique o armazenamento e tente de novo.'); return false; }
  records = next;
  return true;
}
function say(message) { $('#status').textContent = message; }
function route() {
  const key = location.hash.slice(1);
  return Object.hasOwn(labels,key) ? key : 'inicio';
}
function sorted(key) {
  if (key === 'agenda') return [...records[key]].sort((a,b) => Number(!!a.done)-Number(!!b.done) || a.date.localeCompare(b.date));
  if (key === 'som') return [...records[key]].sort((a,b) => Number(b.plays)-Number(a.plays));
  return records[key];
}
function overview() {
  const pending = records.agenda.filter(item => !item.done).length;
  const grades = records.notas.filter(item => item.grade !== '').map(item => Number(item.grade));
  const average = grades.length ? (grades.reduce((sum,value) => sum+value,0)/grades.length).toLocaleString('pt-BR',{maximumFractionDigits:2}) : '—';
  const top = sorted('som')[0];
  const wanted = records.compras.filter(item => !item.done);
  const total = wanted.reduce((sum,item) => sum+Number(item.price || 0),0);
  const metrics = {agenda:[pending,'Lembretes pendentes'],notas:[average,'Média das notas registradas'],som:[top?.plays ?? 0,top?.title ?? 'Nenhuma faixa registrada'],compras:[wanted.length,money.format(total) + ' em itens pendentes']};
  return '<div class="hero"><h1>SALVE, <span>VIAANA.</span></h1><p>O painel pessoal de Guilherme Viana.</p><button class="primary" data-new="agenda">+ Novo lembrete</button></div><div class="grid">' +
    Object.entries(metrics).map(([key,[count,detail]]) => '<a class="tile panel" href="#'+key+'">'+icon(key)+'<h2>'+labels[key]+'</h2><strong class="count">'+count+'</strong><p>'+escapeHtml(detail)+'</p></a>').join('')+'</div>';
}
function details(key,item) {
  if (key === 'agenda') return [dateFormat.format(new Date(item.date)),item.done ? 'Concluído' : 'Pendente',item.detail];
  if (key === 'notas') return [item.grade === '' ? 'Sem nota' : 'Nota '+Number(item.grade).toLocaleString('pt-BR'),item.detail];
  if (key === 'som') return [item.detail,item.plays+' '+(Number(item.plays) === 1 ? 'reprodução' : 'reproduções')];
  return [item.price === '' ? '' : money.format(item.price),item.done ? 'Comprado' : 'Na lista',item.detail];
}
function row(key,item) {
  const toggle = key === 'som' ? '+1 play' : key === 'agenda' || key === 'compras' ? item.done ? 'Reabrir' : key === 'agenda' ? 'Concluir' : 'Marcar comprado' : '';
  return '<article class="row"><div><strong>'+escapeHtml(item.title)+'</strong><small>'+details(key,item).filter(Boolean).map(escapeHtml).join(' · ')+'</small></div><div class="actions" data-id="'+item.id+'">'+
    (toggle ? '<button data-action="toggle">'+toggle+'</button>' : '')+'<button data-action="edit">Editar</button><button data-action="delete">Excluir</button></div></article>';
}
function render() {
  const key = route();
  $('#nav').innerHTML = Object.entries(labels).map(([id,label]) => '<a href="#'+id+'"'+(id === key ? ' aria-current="page"' : '')+'>'+icon(id)+label+'</a>').join('');
  $('#today').textContent = new Intl.DateTimeFormat('pt-BR',{weekday:'long',day:'numeric',month:'long'}).format(new Date());
  if (key === 'inicio') { $('#content').innerHTML = overview(); return; }
  const config = sections[key];
  const list = sorted(key);
  $('#content').innerHTML = '<div class="section-head"><h1>'+config.heading+'</h1><button class="primary" data-new="'+key+'">+ '+config.action+'</button></div><div class="list">'+
    (list.length ? list.map(item => row(key,item)).join('') : '<p class="empty">'+config.empty+'</p>')+'</div>';
}
function openEditor(key,item) {
  editContext = {key,id:item?.id};
  $('#form-title').textContent = item ? 'Editar' : sections[key].action;
  $('#fields').innerHTML = sections[key].fields.map(([name,label,type,required,extra]) => {
    const value = escapeHtml(item?.[name] ?? (name === 'plays' ? '0' : ''));
    const control = type === 'textarea' ? '<textarea name="'+name+'" maxlength="500">'+value+'</textarea>' :
      '<input name="'+name+'" type="'+type+'" value="'+value+'" '+(required ? 'required' : '')+' '+(extra ?? '')+' '+(type === 'text' ? 'maxlength="120"' : '')+'>';
    return '<label>'+label+(required ? ' *' : '')+control+'</label>';
  }).join('');
  $('#editor').showModal();
  $('#fields input').focus();
}
$('#cancel').onclick = () => $('#editor').close();
$('#entry-form').addEventListener('submit', event => {
  event.preventDefault();
  const form = event.currentTarget;
  const values = Object.fromEntries([...new FormData(form)].map(([key,value]) => [key,value.trim()]));
  if (!values.title) { form.elements.title.setCustomValidity('Digite um nome.'); form.elements.title.reportValidity(); return; }
  const {key,id} = editContext;
  if (!save(next => {
    const original = next[key].find(item => item.id === id);
    if (id && !original) return;
    if (!original) { next[key].push({...values,id:crypto.randomUUID(),done:false}); return; }
    if (key === 'agenda' && original.date !== values.date) original.notified = false;
    Object.assign(original,values);
  })) return;
  $('#editor').close();
  render();
  say('Salvo.');
  void checkReminders();
});
$('#entry-form').addEventListener('input',event => event.target.setCustomValidity(''));
$('#content').addEventListener('click',event => {
  const button = event.target.closest('button');
  if (!button) return;
  if (button.dataset.new) { openEditor(button.dataset.new); return; }
  const key = route();
  const id = button.closest('[data-id]')?.dataset.id;
  const item = records[key]?.find(entry => entry.id === id);
  if (!item) return;
  if (button.dataset.action === 'edit') { openEditor(key,item); return; }
  const remove = button.dataset.action === 'delete';
  if (remove && !confirm('Excluir “'+item.title+'”?')) return;
  if (!save(next => {
    const current = next[key].find(entry => entry.id === id);
    if (!current) return;
    if (remove) next[key] = next[key].filter(entry => entry.id !== id);
    else if (key === 'som') current.plays = Number(current.plays)+1;
    else current.done = !current.done;
  })) return;
  render();
  const actions = [...$('#content').querySelectorAll('[data-id]')].find(element => element.dataset.id === id);
  (actions?.querySelector('[data-action="toggle"]') ?? $('#content [data-new]'))?.focus();
  say(remove ? 'Excluído.' : 'Atualizado.');
});
function loggedIn() { return sessionStorage.getItem(sessionKey) === 'yes'; }
function showSession() {
  $('#lock').hidden = loggedIn();
  $('#shell').hidden = !loggedIn();
  if (loggedIn()) { render(); void checkReminders(); }
  else $('#login input').focus();
}
$('#login').addEventListener('submit',async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const password = form.elements.password.value;
  const digest = await crypto.subtle.digest('SHA-256',new TextEncoder().encode(password));
  const hash = Array.from(new Uint8Array(digest),byte => byte.toString(16).padStart(2,'0')).join('');
  if (form.elements.user.value.trim().toLowerCase() !== 'guilherme.viana' || hash !== '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92') {
    $('#login-error').textContent = 'Usuário ou senha incorretos.';
    return;
  }
  sessionStorage.setItem(sessionKey,'yes');
  form.reset();
  $('#login-error').textContent = '';
  showSession();
  $('#main').focus();
});
$('#logout').onclick = () => { sessionStorage.removeItem(sessionKey); showSession(); };
addEventListener('hashchange',() => { if (loggedIn()) { render(); say(''); scrollTo(0,0); $('#main').focus(); } });
addEventListener('storage',event => { if (event.key === storageKey) { records = read(); if (loggedIn()) render(); } });
addEventListener('beforeinstallprompt',event => { event.preventDefault(); installEvent = event; });
addEventListener('appinstalled',() => { installEvent = null; $('#install').hidden = true; });
$('#install').hidden = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
$('#install').onclick = async () => {
  if (!installEvent) { $('#help').showModal(); return; }
  const prompt = installEvent;
  installEvent = null;
  await prompt.prompt();
};
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').then(() => navigator.serviceWorker.ready).then(registration => { worker = registration; void checkReminders(); }).catch(() => {});
$('#notify').onclick = async () => {
  if (!('Notification' in window)) { say('Para avisos, abra em um navegador compatível. No iPhone, instale o app pela Tela de Início.'); return; }
  const result = await Notification.requestPermission();
  if (result !== 'granted') { say('Permita notificações nas configurações do navegador para receber avisos.'); return; }
  say('Avisos ativados. Mantenha o app aberto para receber os lembretes no horário.');
  void checkReminders();
};
async function checkReminders() {
  if (checking || !loggedIn() || !worker || !('Notification' in window) || Notification.permission !== 'granted') return;
  checking = true;
  try {
    for (const item of read().agenda) {
      if (item.done || item.notified || new Date(item.date).getTime() > Date.now()) continue;
      await worker.showNotification('VIAANA · Lembrete',{body:item.title,icon:'./icon-192.png',tag:'viaana-'+item.id});
      save(next => { const current = next.agenda.find(entry => entry.id === item.id && entry.date === item.date); if (current) current.notified = true; });
    }
  } catch { say('O navegador não conseguiu exibir o aviso. Confira as permissões de notificação.'); }
  finally { checking = false; }
}
setInterval(checkReminders,10000);
document.addEventListener('visibilitychange',() => { if (!document.hidden) void checkReminders(); });
showSession();
