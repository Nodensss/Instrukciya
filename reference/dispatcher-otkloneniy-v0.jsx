import { useState, useEffect } from "react";

// ДИСПЕТЧЕР ОТКЛОНЕНИЙ v0 — тренажёр по Табл. №12 инструкции 408-Р-6 (стр. 385–398)
// 36 карточек с полным дословным текстом; ещё 16 ждут добивки текста (см. deviations.json)

const DEVIATIONS = [
  {id:2,p:385,g:"kip",s:"При опробовании гидроклапанов с ЦПУ сигнализация положения их на мнемосхеме не работает",c:"Вышли из строя сигнальные лампы на мнемосхеме",a:"Заменить сигнальные лампы."},
  {id:3,p:385,g:"pumps",s:"Длительное время работают насосы гидростанции управления клапанами (более 3-х минут). Контроль вести по монитору АСУТП",c:"Насос не создает необходимого давления в гидросистеме (неисправность насоса)",a:"Остановить насос. Сбросить давление из системы, произвести его замену."},
  {id:4,p:386,g:"propan",s:"Самопроизвольное прекращение подачи пропана (пропилена) в рецикл",c:"Низкое давление пропана (пропилена) в трубопроводе подачи на всас бустерного компрессора",a:"1. Проверить контур регулирования давления пропана (пропилена). 2. Проверить давление пропана (пропилена) по месту."},
  {id:5,p:386,g:"propan",s:"Автоматическое прекращение подачи пропана",c:"Низкое давление пропана (пропилена) в испарителе",a:"1. Проверить контур регулирования давления в испарителе. 2. Проверить давление пропана (пропилена) по месту."},
  {id:10,p:389,g:"reactor",s:"Повышение давления в реакторе при процессе полимеризации",c:"Неисправность в системе автоматического регулирования давления",a:"Перейти на ручное управление давлением в реакторе, стабилизировать давление."},
  {id:12,p:390,g:"gas",s:"Повышение уровня в ОВД А(Б)-401",c:"Неправильная установка задания на регуляторе уровня",a:"Проверить работу клапана LV-14702 (24702)."},
  {id:13,p:390,g:"gas",s:"Высокая температура в ОВД А(Б)-401",c:"Неисправность термопар",a:"1. Проверить значение температур нижней, средней, верхней зон ОВД. 2. Сообщить слесарю КИПиА ИТСК о несоответствии."},
  {id:14,p:391,g:"gas",s:"Высокое давление в ОВД А(Б)-401",c:"Неисправность автоматического регулирования давления на узле очистки газа высокого давления",a:"Перейти на ручное управление, уменьшить число оборотов компрессора I каскада."},
  {id:15,p:391,g:"gas",s:"Повышение температуры газа на выходе из последней секции холодильников А(Б)-503",c:"Забивается полимером последняя секция холодильников",a:"Переключить секции холодильников."},
  {id:16,p:391,g:"gas",s:"Растет давление на входе газа в холодильник выше 29 МПа",c:"При переключении секций холодильников не полностью открыта арматура",a:"Проверить открытие арматуры."},
  {id:17,p:391,g:"nmpe",s:"Давление газа в сборнике А(Б)-507 при выгрузке НМПЭ из А(Б)-503/2-6, 502 поднимается выше 0,05 МПа",c:"Сборник А(Б)-507 забился НМПЭ из-за несвоевременного опорожнения или отсутствия обогрева",a:"Проверить обогрев, выгрузить НМПЭ."},
  {id:18,p:391,g:"nmpe",s:"Растет давление в сепараторах А(Б)-507",c:"Забились полимером из-за плохого обогрева",a:"Слить НМПЭ из А(Б)-507. Проверить обогрев."},
  {id:19,p:392,g:"nmpe",s:"Нет проходимости по линии слива НМПЭ",c:"Заброс высокомолекулярного полимера в системе очистки газа",a:"Отрегулировать уровень в ОВД."},
  {id:23,p:393,g:"bohler",s:"Отсутствует управление клапаном «Böhler» от РЭГ и БРУ",c:"Нарушение в схеме управления клапана «Böhler»",a:"Перейти на резервный сервоусилитель, стабилизировать процесс, доложить начальнику смены."},
  {id:25,p:393,g:"reactor",s:"После пуска технологической линии низкий ПТР полиэтилена при высоких температурах по зонам реактора",c:"Недостаточное количество пропилена (пропана) в системе",a:"Снизить давление в реакторном блоке на 5-7 МПа, увеличить дозировку кислорода, увеличить дозировку пропилена."},
  {id:26,p:394,g:"reactor",s:"После пуска технологической линии высокий ПТР полиэтилена при низких температурах по зонам реактора",c:"Большое количество пропилена (пропана) в системе",a:"Закрыть тонкую дозировку пропилена, увеличить сдувку на газоразделение. После выхода на заданную марку снизить сдувку, открыть тонкую дозировку пропилена."},
  {id:27,p:394,g:"dosing",s:"После пуска насоса А(Б)-329/1-4 нет ходов на плунжерах",c:"Заклинивание плунжера",a:"Собрать схему резервного насоса и пустить его вместо планируемого."},
  {id:28,p:394,g:"dosing",s:"Низкий уровень раствора в емкости А(Б)-315, 323, 321, 324, 336",c:"Своевременно не приготовлен раствор",a:"Приготовить раствор инициатора."},
  {id:29,p:394,g:"dosing",s:"Не поднимается давление на нагнетании насосов А(Б)-316, 314/1,2, 322/1,2, 325/1,2, 337/1,2, 313/1,2",c:"Низкий уровень раствора в емкости А(Б)-315",a:"Приготовить раствор инициатора."},
  {id:30,p:394,g:"dosing",s:"Электронасос А(Б)-316, 314/1,2, 322/1,2, 325/1,2, 337/1,2, 312/1,2 при пуске гудит, не проворачивается",c:"Обрыв одной фазы питающей сети",a:"Перейти на резервный насос, вызвать дежурного электромонтера."},
  {id:31,p:394,g:"dosing",s:"Повышенный шум и вибрация насоса А(Б)-316, 314/1,2, 322/1,2, 325/1,2, 337/1,2, 312/1,2",c:"Кавитационный режим работы",a:"Обеспечить требуемый кавитационный запас."},
  {id:33,p:394,g:"dosing",s:"Не достигается нормальная подача насоса",c:"Клапана головки насоса имеют утечку",a:"Обтянуть винтовые соединения, предварительно сбросив давление с насоса."},
  {id:34,p:395,g:"dosing",s:"Поршень рабочего цилиндра насоса А(Б)-329/1-4 иногда остается в конечном положении",c:"Загрязнение масла вызывает несинхронное включение переключающих устройств",a:"1. Произвести чистку фильтра. 2. Произвести замену масла."},
  {id:35,p:395,g:"oil",s:"Температура гидравлического масла слишком высокая",c:"Не подключена подача воды к холодильнику",a:"Включить холодильник."},
  {id:37,p:396,g:"pumps",s:"Повышение вибрации насоса",c:"Неправильная центровка эл. двигателя с насосом",a:"Отцентровать насос."},
  {id:38,p:396,g:"pumps",s:"Вибрация на опорных лапах насоса превышает 0,05 мм",c:"Изношен подшипник",a:"Заменить подшипник."},
  {id:39,p:396,g:"pumps",s:"Нагрев сальника",c:"Сальник сильно затянут",a:"Ослабить нажим втулки сальника, обеспечить проток жидкости от 0,25 до 0,5 л/мин."},
  {id:40,p:396,g:"hotwater",s:"Неплотности на насосах или в трубопроводах горячей воды",c:"1. Неплотности во фланцах. 2. Разрыв в трубопроводе",a:"1. Включить резервный насос и отключить неисправный. 2. Остановить циркуляцию."},
  {id:41,p:396,g:"oil",s:"Высокое давление смазки",c:"1. Забит масляный фильтр. 2. Низкая температура масла",a:"1. Заменить фильтр. 2. Отрегулировать подачу охлаждающей воды."},
  {id:43,p:397,g:"hotwater",s:"Неравномерная подача воды насосами",c:"1. Вентиль на стороне всасывания не полностью открыт. 2. Забита решетка фильтра на всасывании. 3. Искривление ротора",a:"1. Открыть вентиль на всасывании. 2. Включить резервный насос. 3. Включить резервный насос."},
  {id:44,p:397,g:"oil",s:"Из насоса вытекает масло",c:"Повреждено уплотняющее кольцо",a:"1. Включить вспомогательный масляный насос. 2. Выключить неисправный насос и сдать его в ремонт."},
  {id:45,p:397,g:"oil",s:"Низкое давление масла смазки",c:"Масляный насос не подает масло",a:"1. Включить вспомогательный масляный насос. 2. Выключить неисправный насос и включить резервный."},
  {id:49,p:398,g:"pumps",s:"Неплотность сальникового уплотнения",c:"1. Слабо затянута нажимная втулка сальника. 2. Износ рабочей поверхности обшивки вала",a:"1. Подтянуть сальник. 2. Вывести в ремонт насос."},
  {id:50,p:398,g:"hotwater",s:"Срабатывает предохранительный клапан на одной из емкостей",c:"1. Разъедена поверхность седла. 2. Перекос клапана",a:"1. Сообщить начальнику смены, по его указанию сбросить давление из бойлера. 2. Сменить клапан."},
  {id:51,p:398,g:"hotwater",s:"Высокая температура горячей воды в емкостях",c:"Неисправен регулятор давления",a:"Перейти на ручное регулирование давления в емкости."},
  {id:52,p:398,g:"hotwater",s:"Низкая температура горячей воды в емкости",c:"1. Неисправен регулятор давления в емкости. 2. Низкое давление пара в сети",a:"1. Перейти на ручное регулирование давления в емкости. 2. Отрегулировать давление пара в сети."}
];

const GROUP_NAMES = {kip:"КИПиА", pumps:"Насосное", propan:"Пропан/пропилен", reactor:"Реактор", gas:"Очистка газа", nmpe:"НМПЭ", bohler:"Клапан «Böhler»", dosing:"Дозировка", oil:"Маслосистема", hotwater:"Горячая вода"};

const C = {bg:"#0c1216", panel:"#141d24", inset:"#0f171d", line:"#24343f", text:"#dce6ee", dim:"#7f95a4", green:"#46d17e", amber:"#f2b63c", red:"#f0685e", blue:"#54b6e8"};

function shuffle(arr){const a=[...arr];for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}

function buildOptions(card, field){
  const correct = card[field];
  const same = DEVIATIONS.filter(d=>d.id!==card.id && d.g===card.g && d[field]!==correct).map(d=>d[field]);
  const rest = DEVIATIONS.filter(d=>d.id!==card.id && d.g!==card.g && d[field]!==correct).map(d=>d[field]);
  const pool = [...new Set([...shuffle(same), ...shuffle(rest)])];
  return shuffle([correct, ...pool.slice(0,3)]);
}

async function loadStats(){
  try{const r=await window.storage.get("dispatcher_v0_stats");return r?JSON.parse(r.value):null;}catch(e){return null;}
}
async function saveStats(st){
  try{await window.storage.set("dispatcher_v0_stats", JSON.stringify(st));}catch(e){/* офлайн-режим без сохранения */}
}

const LETTERS = ["А","Б","В","Г"];

export default function DispatcherV0(){
  const [screen,setScreen]=useState("home");
  const [stats,setStats]=useState({best:0,plays:0,mastered:[]});
  const [deck,setDeck]=useState([]);
  const [idx,setIdx]=useState(0);
  const [opts,setOpts]=useState({c:[],a:[]});
  const [phase,setPhase]=useState("c");
  const [picked,setPicked]=useState(null);
  const [causeOk,setCauseOk]=useState(false);
  const [score,setScore]=useState(0);
  const [streak,setStreak]=useState(0);
  const [bestRun,setBestRun]=useState(0);
  const [results,setResults]=useState([]);

  useEffect(()=>{loadStats().then(s=>{if(s)setStats(s);});},[]);

  const card = deck[idx];

  function setupCard(d,i){
    const c=d[i];
    setOpts({c:buildOptions(c,"c"), a:buildOptions(c,"a")});
    setPhase("c"); setPicked(null); setCauseOk(false);
  }
  function start(){
    const d=shuffle(DEVIATIONS).slice(0,10);
    setDeck(d); setIdx(0); setScore(0); setStreak(0); setBestRun(0); setResults([]);
    setupCard(d,0); setScreen("game");
  }
  function pick(text){
    if(picked!==null) return;
    setPicked(text);
    const ok = text===card[phase];
    if(ok) setScore(s=>s+1);
    if(phase==="c") setCauseOk(ok);
  }
  function next(){
    if(phase==="c"){ setPhase("a"); setPicked(null); return; }
    const actionOk = picked===card.a;
    const full = causeOk && actionOk;
    const newStreak = full ? streak+1 : 0;
    setStreak(newStreak); setBestRun(b=>Math.max(b,newStreak));
    const res=[...results,{id:card.id,p:card.p,s:card.s,causeOk,actionOk}];
    setResults(res);
    if(idx+1<deck.length){ setIdx(idx+1); setupCard(deck,idx+1); }
    else{
      const mastered=[...new Set([...stats.mastered,...res.filter(r=>r.causeOk&&r.actionOk).map(r=>r.id)])];
      const ns={best:Math.max(stats.best,Math.max(bestRun,newStreak)),plays:stats.plays+1,mastered};
      setStats(ns); saveStats(ns); setScreen("end");
    }
  }

  const S={
    app:{minHeight:"100vh",background:C.bg,color:C.text,fontFamily:"system-ui,-apple-system,'Segoe UI',Roboto,sans-serif"},
    mono:{fontFamily:"ui-monospace,'SF Mono','Cascadia Mono',Consolas,monospace",letterSpacing:"0.08em"},
    plate:{background:C.panel,border:"1px solid "+C.line,borderRadius:10}
  };

  const StatusBar=()=>(
    <div className="flex items-center justify-between px-4 py-2" style={{...S.mono,borderBottom:"1px solid "+C.line,fontSize:11,color:C.dim}}>
      <span className="flex items-center gap-2">
        <span className="pulse-dot" style={{width:7,height:7,borderRadius:99,background:C.green,display:"inline-block"}}></span>
        РЕАКТОРНЫЙ БЛОК · ТАБЛ. №12
      </span>
      <span>408-Р-6 · СТР. 385–398</span>
    </div>
  );

  const OptionBtn=({text,letter})=>{
    const isPicked=picked===text, isCorrect=text===card[phase], revealed=picked!==null;
    let border=C.line, bg=C.inset, mark=null, dim=false;
    if(revealed){
      if(isCorrect){border=C.green;bg="rgba(70,209,126,0.08)";mark="✓ ВЕРНО ПО ИНСТРУКЦИИ";}
      else if(isPicked){border=C.red;bg="rgba(240,104,94,0.08)";mark="✕ НЕ ПО ЭТОМУ ОТКЛОНЕНИЮ";}
      else dim=true;
    }
    return (
      <button onClick={()=>pick(text)} disabled={revealed} className="np w-full text-left p-3 transition-colors"
        style={{border:"1px solid "+border,background:bg,borderRadius:10,opacity:dim?0.45:1}}>
        <div className="flex gap-3">
          <span style={{...S.mono,fontSize:11,color:revealed&&isCorrect?C.green:(revealed&&isPicked?C.red:C.blue),paddingTop:2}}>{letter}</span>
          <div className="flex-1">
            <div style={{fontSize:14,lineHeight:1.45}}>{text}</div>
            {mark&&<div className="mt-2" style={{...S.mono,fontSize:10,color:isCorrect?C.green:C.red}}>{mark}</div>}
          </div>
        </div>
      </button>
    );
  };

  return (
    <div style={S.app}>
      <style>{`
        .pulse-dot{animation:pd 1.6s ease-in-out infinite}
        @keyframes pd{0%,100%{opacity:1}50%{opacity:.25}}
        .np:focus-visible{outline:2px solid ${"#54b6e8"};outline-offset:2px}
        @media (prefers-reduced-motion: reduce){.pulse-dot{animation:none}}
      `}</style>
      <StatusBar/>
      <div className="mx-auto px-4 pb-10" style={{maxWidth:560}}>

        {screen==="home"&&(
          <div className="pt-10">
            <div style={{...S.mono,fontSize:11,color:C.amber}}>ТРЕНАЖЁР СМЕНЫ · МОДУЛЬ 1</div>
            <h1 className="mt-2" style={{fontSize:34,fontWeight:800,lineHeight:1.05,letterSpacing:"-0.01em"}}>ДИСПЕТЧЕР<br/>ОТКЛОНЕНИЙ</h1>
            <p className="mt-3" style={{color:C.dim,fontSize:14,lineHeight:1.5}}>Симптом → причина → действия персонала. Все формулировки — дословно из Табл. №12. Неверные варианты — реальные причины других отклонений.</p>
            <div className="grid grid-cols-3 gap-2 mt-6">
              {[["ОСВОЕНО",stats.mastered.length+"/36"],["ЛУЧШАЯ СЕРИЯ",stats.best],["СМЕН",stats.plays]].map(([l,v])=>(
                <div key={l} className="p-3 text-center" style={S.plate}>
                  <div style={{...S.mono,fontSize:22,color:C.green}}>{v}</div>
                  <div className="mt-1" style={{...S.mono,fontSize:9,color:C.dim}}>{l}</div>
                </div>
              ))}
            </div>
            <button onClick={start} className="np w-full mt-6 py-4" style={{background:C.amber,color:"#1a1408",borderRadius:12,fontWeight:800,letterSpacing:"0.12em",fontSize:15}}>
              ПРИНЯТЬ СМЕНУ · 10 КАРТОЧЕК
            </button>
            <div className="mt-5 p-3" style={{...S.plate,background:C.inset}}>
              <div style={{...S.mono,fontSize:10,color:C.dim,lineHeight:1.7}}>В БАЗЕ 36 ИЗ 52 ОТКЛОНЕНИЙ. ЕЩЁ 16 ЖДУТ ПОЛНОГО ТЕКСТА СО СТР. 385–398 (СМ. deviations.json).<br/>УЧЕБНЫЙ ТРЕНАЖЁР — НЕ ЗАМЕНЯЕТ ИНСТРУКЦИЮ 408-Р-6.</div>
            </div>
          </div>
        )}

        {screen==="game"&&card&&(
          <div className="pt-5">
            <div className="flex items-center justify-between" style={{...S.mono,fontSize:11,color:C.dim}}>
              <span>КАРТОЧКА {idx+1}/{deck.length}</span>
              <span style={{color:streak>0?C.green:C.dim}}>СЕРИЯ: {streak}</span>
            </div>
            <div className="mt-3 overflow-hidden" style={{...S.plate,display:"flex"}}>
              <div style={{width:5,background:picked===null?C.blue:(picked===card[phase]?C.green:C.red)}}></div>
              <div className="p-4 flex-1">
                <div style={{...S.mono,fontSize:10,color:C.blue}}>ОТКЛОНЕНИЕ №{card.id} · {GROUP_NAMES[card.g].toUpperCase()} · СТР. {card.p}</div>
                <div className="mt-2" style={{fontSize:16,fontWeight:600,lineHeight:1.45}}>{card.s}</div>
              </div>
            </div>
            <div className="mt-5 mb-2" style={{...S.mono,fontSize:11,color:C.amber}}>
              {phase==="c"?"ВОЗМОЖНАЯ ПРИЧИНА?":"ДЕЙСТВИЯ ПЕРСОНАЛА?"}
            </div>
            <div className="flex flex-col gap-2">
              {opts[phase].map((t,i)=><OptionBtn key={i} text={t} letter={LETTERS[i]}/>)}
            </div>
            {picked!==null&&(
              <button onClick={next} className="np w-full mt-4 py-3" style={{background:C.panel,border:"1px solid "+C.blue,color:C.text,borderRadius:10,...S.mono,fontSize:12}}>
                {phase==="c"?"К ДЕЙСТВИЯМ →":(idx+1<deck.length?"СЛЕДУЮЩЕЕ ОТКЛОНЕНИЕ →":"ИТОГИ СМЕНЫ →")}
              </button>
            )}
          </div>
        )}

        {screen==="end"&&(
          <div className="pt-10">
            <div style={{...S.mono,fontSize:11,color:C.dim}}>СМЕНА СДАНА</div>
            <div className="mt-2 flex items-end gap-4">
              <span style={{...S.mono,fontSize:52,color:score>=16?C.green:(score>=10?C.amber:C.red),lineHeight:1}}>{score}<span style={{fontSize:20,color:C.dim}}>/20</span></span>
              <span className="pb-2" style={{...S.mono,fontSize:12,color:C.dim}}>МАКС. СЕРИЯ: {bestRun}</span>
            </div>
            {results.some(r=>!(r.causeOk&&r.actionOk))?(
              <div className="mt-6">
                <div style={{...S.mono,fontSize:11,color:C.amber}}>СВЕРИТЬ С ИНСТРУКЦИЕЙ:</div>
                <div className="flex flex-col gap-2 mt-2">
                  {results.filter(r=>!(r.causeOk&&r.actionOk)).map(r=>(
                    <div key={r.id} className="p-3" style={S.plate}>
                      <div style={{...S.mono,fontSize:10,color:C.red}}>№{r.id} · СТР. {r.p} · {!r.causeOk&&!r.actionOk?"ПРИЧИНА И ДЕЙСТВИЯ":(!r.causeOk?"ПРИЧИНА":"ДЕЙСТВИЯ")}</div>
                      <div className="mt-1" style={{fontSize:13,color:C.dim,lineHeight:1.4}}>{r.s}</div>
                    </div>
                  ))}
                </div>
              </div>
            ):(
              <div className="mt-6 p-4" style={{...S.plate,borderColor:C.green}}>
                <div style={{...S.mono,fontSize:12,color:C.green}}>БЕЗ ЗАМЕЧАНИЙ. ВСЕ 10 — ПО ИНСТРУКЦИИ.</div>
              </div>
            )}
            <div className="flex gap-2 mt-6">
              <button onClick={start} className="np flex-1 py-3" style={{background:C.amber,color:"#1a1408",borderRadius:10,fontWeight:800,...S.mono,fontSize:12}}>ЕЩЁ СМЕНА</button>
              <button onClick={()=>setScreen("home")} className="np flex-1 py-3" style={{background:C.panel,border:"1px solid "+C.line,color:C.text,borderRadius:10,...S.mono,fontSize:12}}>НА ГЛАВНУЮ</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
