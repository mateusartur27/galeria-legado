export const LIGHTING_DEFAULTS=Object.freeze({brightness:1,lightHeight:5.35,roofBrightness:.7});
// Increment only when the shared art direction should replace older local roof presets.
export const ROOF_PRESET_VERSION=1;
export const LIGHTING_STORAGE_KEY='legado.lighting.zones.v2';
const clamp=(n,min,max,fallback)=>Number.isFinite(n)?Math.min(max,Math.max(min,n)):fallback;
function readSettings(){
 try{const saved=JSON.parse(localStorage.getItem(LIGHTING_STORAGE_KEY))??{brightness:1,lightHeight:JSON.parse(localStorage.getItem('legado.lighting.v1'))?.lightHeight};return{brightness:clamp(saved?.brightness,.2,1.5,1),lightHeight:clamp(saved?.lightHeight,1,7,5.35),roofBrightness:saved?.roofPresetVersion===ROOF_PRESET_VERSION?clamp(saved?.roofBrightness,.2,3,.7):LIGHTING_DEFAULTS.roofBrightness};}
 catch{return{...LIGHTING_DEFAULTS};}
}
export function createLightingControls({onChange,onOpen}){
 const settings=readSettings();
 const button=document.createElement('button');button.id='lighting-toggle';button.type='button';button.textContent='☼';button.title='Ajustar iluminação';button.setAttribute('aria-label','Ajustar iluminação');button.setAttribute('aria-expanded','false');button.setAttribute('aria-controls','lighting-panel');
 document.getElementById('cinema').before(button);
 const panel=document.createElement('section');panel.id='lighting-panel';panel.className='lighting-panel';panel.hidden=true;panel.setAttribute('aria-labelledby','lighting-title');
 panel.innerHTML=`<div class="lighting-heading"><h2 id="lighting-title">Iluminação</h2><button type="button" id="lighting-close" aria-label="Fechar ajustes">×</button></div>
 <label for="lighting-brightness">Luz do ambiente <output id="lighting-brightness-value" for="lighting-brightness"></output></label>
 <input id="lighting-brightness" type="range" min="20" max="150" step="1">
 <label for="lighting-roof">Brilho do telhado <output id="lighting-roof-value" for="lighting-roof"></output></label>
 <input id="lighting-roof" type="range" min="20" max="300" step="5">
 <label for="lighting-height">Altura das luzes <output id="lighting-height-value" for="lighting-height"></output></label>
 <input id="lighting-height" type="range" min="1" max="7" step="0.05">
 <p class="lighting-zones">Padrão da galeria: telhado em 70%, com transição suave nas paredes. Lustres: 100%.</p>
 <p id="lighting-status" role="status">Ajustes guardados neste navegador.</p>
 <div class="lighting-actions"><button type="button" id="lighting-reset">Restaurar padrão</button><button type="button" id="lighting-save">Salvar ajustes</button></div>`;
 document.body.append(panel);
 const $=id=>document.getElementById(id);
 const sync=()=>{$('lighting-brightness').value=Math.round(settings.brightness*100);$('lighting-height').value=settings.lightHeight;$('lighting-roof').value=Math.round(settings.roofBrightness*100);$('lighting-roof-value').value=`${Math.round(settings.roofBrightness*100)}%`;$('lighting-brightness-value').value=`${Math.round(settings.brightness*100)}%`;$('lighting-height-value').value=`${settings.lightHeight.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})} m`;onChange(settings);};
 const close=()=>{panel.hidden=true;button.setAttribute('aria-expanded','false');button.focus();};
 button.onclick=()=>{if(!panel.hidden){close();return;}onOpen?.();panel.hidden=false;button.setAttribute('aria-expanded','true');$('lighting-brightness').focus();};
 $('lighting-close').onclick=close;
 panel.addEventListener('keydown',event=>{if(event.key==='Escape'){event.stopPropagation();close();}});
 const update=()=>{settings.brightness=Number($('lighting-brightness').value)/100;settings.lightHeight=Number($('lighting-height').value);settings.roofBrightness=Number($('lighting-roof').value)/100;sync();$('lighting-status').textContent='Alterações ainda não salvas.';};
 $('lighting-brightness').addEventListener('input',update);$('lighting-height').addEventListener('input',update);$('lighting-roof').addEventListener('input',update);
 $('lighting-save').onclick=()=>{try{localStorage.setItem(LIGHTING_STORAGE_KEY,JSON.stringify({version:2,roofPresetVersion:ROOF_PRESET_VERSION,...settings}));$('lighting-status').textContent='Salvo! Seus ajustes serão aplicados ao voltar.';}catch{$('lighting-status').textContent='Não foi possível salvar neste navegador. Os ajustes continuam ativos.';}};
 $('lighting-reset').onclick=()=>{Object.assign(settings,LIGHTING_DEFAULTS);sync();$('lighting-status').textContent='Padrão restaurado. Clique em salvar para guardar.';};
 sync();return{settings};
}

