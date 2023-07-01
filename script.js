
/* /web/static/src/legacy/js/promise_extension.js */
(function(){var _catch=Promise.prototype.catch;Promise.prototype.guardedCatch=function(onRejected){return _catch.call(this,function(reason){const error=(reason instanceof Error&&"cause"in reason)?reason.cause:reason;if(!error||!(error instanceof Error)){if(onRejected){onRejected.call(this,reason);}}
return Promise.reject(reason);});};})();;

/* /web/static/src/boot.js */
(function(){"use strict";var jobs=[];var factories=Object.create(null);var jobDeps=[];var jobPromises=[];const failed=[];var services=Object.create({});if(!globalThis.odoo){globalThis.odoo={};}
var odoo=globalThis.odoo;var debug=odoo.debug;var didLogInfoResolve;var didLogInfoPromise=new Promise(function(resolve){didLogInfoResolve=resolve;});odoo.remainingJobs=jobs;odoo.__DEBUG__={didLogInfo:didLogInfoPromise,getDependencies:function(name,transitive){var deps=name instanceof Array?name:[name];var changed;do{changed=false;jobDeps.forEach(function(dep){if(deps.indexOf(dep.to)>=0&&deps.indexOf(dep.from)<0){deps.push(dep.from);changed=true;}});}while(changed&&transitive);return deps;},getDependents:function(name){return jobDeps.filter(function(dep){return dep.from===name;}).map(function(dep){return dep.to;});},getMissingJobs(){const waited=new Set(jobs.filter((job)=>!job.ignoreMissingDeps).map((job)=>job.name));const missing=new Set();for(const job of waited){for(const dep of this.getDependencies(job)){if(!(dep in this.services)&&!waited.has(dep)&&!failed.find((job)=>job.name===dep)){missing.add(dep);}}}
return[...missing];},processJobs:function(){var job;function processJob(job){var require=makeRequire(job);var jobExec;function onError(e){job.error=e;failed.push(job);console.error(`Error while loading ${job.name}: ${e.message}`,e);Promise.reject(e);}
var def=new Promise(function(resolve){try{jobExec=job.factory.call(null,require);jobs.splice(jobs.indexOf(job),1);}catch(e){onError(e);}
if(!job.error){Promise.resolve(jobExec).then(function(data){services[job.name]=data;resolve();odoo.__DEBUG__.processJobs();}).catch(function(e){if(e instanceof Error){onError(e);}
resolve();});}else{resolve();}});jobPromises.push(def);def.then(job.resolve);}
function isReady(job){return(!job.error&&job.factory.deps.every(function(name){return name in services;}));}
function makeRequire(job){var deps={};Object.keys(services).filter(function(item){return job.deps.indexOf(item)>=0;}).forEach(function(key){deps[key]=services[key];});return function require(name){if(!(name in deps)){console.error("Undefined dependency: ",name);}
return deps[name];};}
while(jobs.length){job=undefined;for(var i=0;i<jobs.length;i++){if(isReady(jobs[i])){job=jobs[i];break;}}
if(!job){break;}
processJob(job);}
return services;},factories:factories,services:services,};odoo.define=function(name,deps,factory){if(!Array.isArray(deps)){throw new Error("Dependencies should be defined by an array",deps);}
if(typeof factory!=="function"){throw new Error("Factory should be defined by a function",factory);}
if(typeof name!=="string"){throw new Error("Invalid name definition (should be a string",name);}
if(name in factories){throw new Error("Service "+name+" already defined");}
factory.deps=deps;factories[name]=factory;let promiseResolve;const promise=new Promise((resolve)=>{promiseResolve=resolve;});jobs.push({name:name,factory:factory,deps:deps,resolve:promiseResolve,promise:promise,ignoreMissingDeps:globalThis.__odooIgnoreMissingDependencies,});deps.forEach(function(dep){jobDeps.push({from:dep,to:name});});odoo.__DEBUG__.processJobs();};odoo.log=function(){var missing=[];var cycle=null;if(jobs.length){var debugJobs={};var job;var jobdep;for(var k=0;k<jobs.length;k++){if(jobs[k].ignoreMissingDeps){continue;}
debugJobs[jobs[k].name]=job={dependencies:jobs[k].deps,dependents:odoo.__DEBUG__.getDependents(jobs[k].name),name:jobs[k].name,};if(jobs[k].error){job.error=jobs[k].error;}
var deps=odoo.__DEBUG__.getDependencies(job.name);for(var i=0;i<deps.length;i++){if(job.name!==deps[i]&&!(deps[i]in services)){jobdep=debugJobs[deps[i]];if(!jobdep&&deps[i]in factories){for(var j=0;j<jobs.length;j++){if(jobs[j].name===deps[i]){jobdep=jobs[j];break;}}}
if(!job.missing){job.missing=[];}
job.missing.push(deps[i]);}}}
missing=odoo.__DEBUG__.getMissingJobs();var unloaded=Object.keys(debugJobs).map(function(key){return debugJobs[key];}).filter(function(job){return job.missing;});if(debug||failed.length||unloaded.length){var log=globalThis.console[!failed.length||!unloaded.length?"info":"error"].bind(globalThis.console);log((failed.length?"error":unloaded.length?"warning":"info")+": Some modules could not be started");if(missing.length){log("Missing dependencies:    ",missing);}
if(failed.length){log("Failed modules:          ",failed.map(function(fail){return fail.name;}));}
if(unloaded.length){cycle=findCycle(unloaded);if(cycle){console.error("Cyclic dependencies: "+cycle);}
log("Non loaded modules:      ",unloaded.map(function(unload){return unload.name;}));}
if(debug&&Object.keys(debugJobs).length){log("Debug:                   ",debugJobs);}}}
const moduleInfo={missing:missing,failed:failed.map((mod)=>mod.name),unloaded:unloaded?unloaded.map((mod)=>mod.name):[],cycle,};odoo.__DEBUG__.jsModules=moduleInfo;displayModuleErrors(moduleInfo);didLogInfoResolve(true);};odoo.ready=async function(serviceName){function match(name){return typeof serviceName==="string"?name===serviceName:serviceName.test(name);}
await Promise.all(jobs.filter((job)=>match(job.name)).map((job)=>job.promise));return Object.keys(factories).filter(match).length;};odoo.runtimeImport=function(moduleName){if(!(moduleName in services)){throw new Error(`Service "${moduleName} is not defined or isn't finished loading."`);}
return services[moduleName];};globalThis.addEventListener("load",function logWhenLoaded(){const len=jobPromises.length;Promise.all(jobPromises).then(function(){if(len===jobPromises.length){odoo.log();}else{logWhenLoaded();}});});function findCycle(jobs){const dependencyGraph=new Map();for(const job of jobs){dependencyGraph.set(job.name,job.dependencies);}
function visitJobs(jobs,visited=new Set()){for(const job of jobs){const result=visitJob(job,visited);if(result){return result;}}
return null;}
function visitJob(job,visited){if(visited.has(job)){const jobs=Array.from(visited).concat([job]);const index=jobs.indexOf(job);return jobs.slice(index).map((j)=>`"${j}"`).join(" => ");}
const deps=dependencyGraph.get(job);return deps?visitJobs(deps,new Set(visited).add(job)):null;}
return visitJobs(jobs.map((j)=>j.name));}
function displayModuleErrors({failed,missing,unloaded,cycle}){if(window.__odooAssetError){return;}
const list=(heading,arr)=>{const frag=document.createDocumentFragment();if(!arr||!arr.length){return frag;}
frag.textContent=heading;const ul=document.createElement("ul");for(const el of arr){const li=document.createElement("li");li.textContent=el;ul.append(li);}
frag.appendChild(ul);return frag;};if([failed,missing,unloaded].some((arr)=>arr.length)||cycle){while(document.body.childNodes.length){document.body.childNodes[0].remove();}
const container=document.createElement("div");container.className="position-fixed w-100 h-100 d-flex align-items-center flex-column bg-white overflow-auto modal";container.style.zIndex="10000";const alert=document.createElement("div");alert.className="alert alert-danger o_error_detail fw-bold m-auto";container.appendChild(alert);alert.appendChild(list("The following modules failed to load because of an error, you may find more information in the devtools console:",failed));alert.appendChild(list("The following modules could not be loaded because they form a dependency cycle:",cycle&&[cycle]));alert.appendChild(list("The following modules are needed by other modules but have not been defined, they may not be present in the correct asset bundle:",missing));alert.appendChild(list("The following modules could not be loaded because they have unmet dependencies, this is a secondary error which is likely caused by one of the above problems:",unloaded));document.body.appendChild(container);}}})();;

/* /web/static/src/session.js */
odoo.define('@web/session',[],function(require){'use strict';let __exports={};const session=__exports.session=odoo.__session_info__||{};delete odoo.__session_info__;return __exports;});;

/* /web/static/src/legacy/js/core/cookie_utils.js */
odoo.define('@web/legacy/js/core/cookie_utils',[],function(require){'use strict';let __exports={};const utils={getCookie(cookieName){var cookies=document.cookie?document.cookie.split('; '):[];for(var i=0,l=cookies.length;i<l;i++){var parts=cookies[i].split('=');var name=parts.shift();var cookie=parts.join('=');if(cookieName&&cookieName===name){if(cookie.startsWith('"')){if(cookie.includes('\\')){throw new Error(`Cookie value contains unknown characters ${cookie}`)}
cookie=cookie.slice(1,-1);}
return cookie;}}
return"";},isAllowedCookie(type){return true;},setCookie(name,value,ttl=31536000,type='required'){ttl=utils.isAllowedCookie(type)?ttl||24*60*60*365:-1;document.cookie=[`${name}=${value}`,'path=/',`max-age=${ttl}`,`expires=${new Date(new Date().getTime() + ttl * 1000).toGMTString()}`,].join(';');},deleteCookie(name){document.cookie=[`${name}=`,'path=/',`max-age=-1`,`expires=${new Date(new Date().getTime() - 1000).toGMTString()}`,].join(';');},};__exports[Symbol.for("default")]=utils;return __exports;});odoo.define(`web.utils.cookies`,['@web/legacy/js/core/cookie_utils'],function(require){return require('@web/legacy/js/core/cookie_utils')[Symbol.for("default")];});;

/* /web/static/src/legacy/js/core/menu.js */
odoo.define('@web/legacy/js/core/menu',[],function(require){'use strict';let __exports={};const BREAKPOINT_SIZES={sm:'575',md:'767',lg:'991',xl:'1199',xxl:'1399'};__exports.initAutoMoreMenu=initAutoMoreMenu;async function initAutoMoreMenu(el,options){if(!el){return;}
const navbar=el.closest('.navbar');const[breakpoint='md']=navbar?Object.keys(BREAKPOINT_SIZES).filter(suffix=>navbar.classList.contains(`navbar-expand-${suffix}`)):[];const isNoHamburgerMenu=!!navbar&&navbar.classList.contains('navbar-expand');options=Object.assign({unfoldable:'none',maxWidth:false,minSize:BREAKPOINT_SIZES[breakpoint],images:[],loadingStyleClasses:[],},options||{});const isUserNavbar=el.parentElement.classList.contains('o_main_navbar');const dropdownSubMenuClasses=['show','border-0','position-static'];const dropdownToggleClasses=['h-auto','py-2','text-secondary'];const autoMarginLeftRegex=/\bm[sx]?(?:-(?:sm|md|lg|xl|xxl))?-auto\b/;const autoMarginRightRegex=/\bm[ex]?(?:-(?:sm|md|lg|xl|xxl))?-auto\b/;var extraItemsToggle=null;let debounce;const afterFontsloading=new Promise((resolve)=>{if(document.fonts){document.fonts.ready.then(resolve);}else{setTimeout(resolve,150);}});afterFontsloading.then(_adapt);if(options.images.length){await _afterImagesLoading(options.images);_adapt();}
const debouncedAdapt=()=>{clearTimeout(debounce);debounce=setTimeout(_adapt,250);};window.addEventListener('resize',debouncedAdapt);el.addEventListener('dom:autoMoreMenu:adapt',_adapt);el.addEventListener('dom:autoMoreMenu:destroy',destroy,{once:true});function _restore(){if(!extraItemsToggle){return;}
[...extraItemsToggle.querySelector('.dropdown-menu').children].forEach((item)=>{if(!isUserNavbar){item.classList.add('nav-item');const itemLink=item.querySelector('.dropdown-item');itemLink.classList.remove('dropdown-item');itemLink.classList.add('nav-link');}else{item.classList.remove('dropdown-item');const dropdownSubMenu=item.querySelector('.dropdown-menu');const dropdownSubMenuButton=item.querySelector('.dropdown-toggle');if(dropdownSubMenu){dropdownSubMenu.classList.remove(...dropdownSubMenuClasses);}
if(dropdownSubMenuButton){dropdownSubMenuButton.classList.remove(...dropdownToggleClasses);}}
el.insertBefore(item,extraItemsToggle);});extraItemsToggle.remove();extraItemsToggle=null;}
function _adapt(){if(options.loadingStyleClasses.length){el.classList.add(...options.loadingStyleClasses);}
_restore();if(!el.getClientRects().length||el.closest('.show')||(window.matchMedia(`(max-width: ${options.minSize}px)`).matches&&!isNoHamburgerMenu)){return _endAutoMoreMenu();}
let unfoldableItems=[];const items=[...el.children].filter((node)=>{if(node.matches&&!node.matches(options.unfoldable)){return true;}
unfoldableItems.push(node);return false;});var nbItems=items.length;var menuItemsWidth=items.reduce((sum,el)=>sum+computeFloatOuterWidthWithMargins(el,true,true,false),0);let maxWidth=0;if(options.maxWidth){maxWidth=options.maxWidth();}
if(!maxWidth){maxWidth=computeFloatOuterWidthWithMargins(el,true,true,true);var style=window.getComputedStyle(el);maxWidth-=(parseFloat(style.paddingLeft)+parseFloat(style.paddingRight)+parseFloat(style.borderLeftWidth)+parseFloat(style.borderRightWidth));maxWidth-=unfoldableItems.reduce((sum,el)=>sum+computeFloatOuterWidthWithMargins(el,true,true,false),0);}
if(maxWidth-menuItemsWidth>=-0.001){return _endAutoMoreMenu();}
const dropdownMenu=_addExtraItemsButton(items[nbItems-1].nextElementSibling);menuItemsWidth+=computeFloatOuterWidthWithMargins(extraItemsToggle,true,true,false);do{menuItemsWidth-=computeFloatOuterWidthWithMargins(items[--nbItems],true,true,false);}while(!(maxWidth-menuItemsWidth>=-0.001)&&(nbItems>0));const extraItems=items.slice(nbItems);extraItems.forEach((el)=>{if(!isUserNavbar){const navLink=el.querySelector('.nav-link, a');el.classList.remove('nav-item');navLink.classList.remove('nav-link');navLink.classList.add('dropdown-item');navLink.classList.toggle('active',el.classList.contains('active'));}else{const dropdownSubMenu=el.querySelector('.dropdown-menu');const dropdownSubMenuButton=el.querySelector('.dropdown-toggle');el.classList.add('dropdown-item','p-0');if(dropdownSubMenu){dropdownSubMenu.classList.add(...dropdownSubMenuClasses);}
if(dropdownSubMenuButton){dropdownSubMenuButton.classList.add(...dropdownToggleClasses);}}
dropdownMenu.appendChild(el);});_endAutoMoreMenu();}
function computeFloatOuterWidthWithMargins(el,mLeft,mRight,considerAutoMargins){var rect=el.getBoundingClientRect();var style=window.getComputedStyle(el);var outerWidth=rect.right-rect.left;const isRTL=style.direction==='rtl';if(mLeft!==false&&(considerAutoMargins||!(isRTL?autoMarginRightRegex:autoMarginLeftRegex).test(el.getAttribute('class')))){outerWidth+=parseFloat(style.marginLeft);}
if(mRight!==false&&(considerAutoMargins||!(isRTL?autoMarginLeftRegex:autoMarginRightRegex).test(el.getAttribute('class')))){outerWidth+=parseFloat(style.marginRight);}
return isNaN(outerWidth)?0:outerWidth;}
function _addExtraItemsButton(target){let dropdownMenu=document.createElement('div');extraItemsToggle=dropdownMenu.cloneNode();const extraItemsToggleIcon=document.createElement('i');const extraItemsToggleLink=document.createElement('a');dropdownMenu.className='dropdown-menu';extraItemsToggle.className='nav-item dropdown o_extra_menu_items';extraItemsToggleIcon.className='fa fa-plus';Object.entries({role:'button',href:'#',class:'nav-link dropdown-toggle o-no-caret','data-bs-toggle':'dropdown','aria-expanded':false,}).forEach(([key,value])=>{extraItemsToggleLink.setAttribute(key,value);});extraItemsToggleLink.appendChild(extraItemsToggleIcon);extraItemsToggle.appendChild(extraItemsToggleLink);extraItemsToggle.appendChild(dropdownMenu);el.insertBefore(extraItemsToggle,target);return dropdownMenu;}
function destroy(){_restore();window.removeEventListener('resize',debouncedAdapt);el.removeEventListener('dom:autoMoreMenu:adapt',_adapt);}
function _afterImagesLoading(images){const defs=images.map((image)=>{if(image.complete||!image.getClientRects().length){return null;}
return new Promise(function(resolve,reject){if(!image.width){image.classList.add('o_menu_image_placeholder');}
image.addEventListener('load',()=>{image.classList.remove('o_menu_image_placeholder');resolve();});});});return Promise.all(defs);}
function _endAutoMoreMenu(){el.classList.remove(...options.loadingStyleClasses);}}
__exports.destroyAutoMoreMenu=destroyAutoMoreMenu;function destroyAutoMoreMenu(el){el.dispatchEvent(new Event('dom:autoMoreMenu:destroy'));}
return __exports;});;

/* /web/static/src/legacy/js/public/lazyloader.js */
odoo.define('@web/legacy/js/public/lazyloader',[],function(require){'use strict';let __exports={};var blockEvents=['submit','click'];var blockFunction=function(ev){ev.preventDefault();ev.stopImmediatePropagation();};var waitingLazy=false;function waitLazy(){if(waitingLazy){return;}
waitingLazy=true;var lazyEls=document.querySelectorAll('.o_wait_lazy_js');for(var i=0;i<lazyEls.length;i++){var element=lazyEls[i];blockEvents.forEach(function(evType){element.addEventListener(evType,blockFunction);});}
document.body.classList.add('o_lazy_js_waiting');}
function stopWaitingLazy(){if(!waitingLazy){return;}
waitingLazy=false;var lazyEls=document.querySelectorAll('.o_wait_lazy_js');for(var i=0;i<lazyEls.length;i++){var element=lazyEls[i];blockEvents.forEach(function(evType){element.removeEventListener(evType,blockFunction);});element.classList.remove('o_wait_lazy_js');}
document.body.classList.remove('o_lazy_js_waiting');}
if(document.readyState!=='loading'){waitLazy();}else{document.addEventListener('DOMContentLoaded',function(){waitLazy();});}
var doResolve=null;var _allScriptsLoaded=new Promise(function(resolve){if(doResolve){resolve();}else{doResolve=resolve;}}).then(function(){stopWaitingLazy();});if(document.readyState==='complete'){setTimeout(_loadScripts,0);}else{window.addEventListener('load',function(){setTimeout(_loadScripts,0);});}
function _loadScripts(scripts,index){if(scripts===undefined){scripts=document.querySelectorAll('script[data-src]');}
if(index===undefined){index=0;}
if(index>=scripts.length){if(typeof doResolve==='function'){doResolve();}else{doResolve=true;}
return;}
var script=scripts[index];script.addEventListener('load',_loadScripts.bind(this,scripts,index+1));script.setAttribute('defer','defer');script.src=script.dataset.src;script.removeAttribute('data-src');}
__exports[Symbol.for("default")]={loadScripts:_loadScripts,allScriptsLoaded:_allScriptsLoaded,};return __exports;});odoo.define(`web.public.lazyloader`,['@web/legacy/js/public/lazyloader'],function(require){return require('@web/legacy/js/public/lazyloader')[Symbol.for("default")];});;

/* /web_editor/static/src/js/frontend/loader_loading.js */
(function(){'use strict';document.addEventListener('DOMContentLoaded',()=>{var textareaEls=document.querySelectorAll('textarea.o_wysiwyg_loader');for(var i=0;i<textareaEls.length;i++){var textarea=textareaEls[i];var wrapper=document.createElement('div');wrapper.classList.add('position-relative','o_wysiwyg_textarea_wrapper');var loadingElement=document.createElement('div');loadingElement.classList.add('o_wysiwyg_loading');var loadingIcon=document.createElement('i');loadingIcon.classList.add('text-600','text-center','fa','fa-circle-o-notch','fa-spin','fa-2x');loadingElement.appendChild(loadingIcon);wrapper.appendChild(loadingElement);textarea.parentNode.insertBefore(wrapper,textarea);wrapper.insertBefore(textarea,loadingElement);}});})();;

/* /website/static/src/js/content/inject_dom.js */
odoo.define('@website/js/content/inject_dom',['web.utils.cookies','@web/session'],function(require){'use strict';let __exports={};const{getCookie}=require('web.utils.cookies');const{session}=require('@web/session');document.addEventListener('DOMContentLoaded',()=>{const htmlEl=document.documentElement;const cookieNamesToDataNames={'utm_source':'utmSource','utm_medium':'utmMedium','utm_campaign':'utmCampaign',};for(const[name,dsName]of Object.entries(cookieNamesToDataNames)){const cookie=getCookie(`odoo_${name}`);if(cookie){htmlEl.dataset[dsName]=cookie.replace(/(^["']|["']$)/g,'');}}
const country=session.geoip_country_code;if(country){htmlEl.dataset.country=country;}
htmlEl.dataset.logged=!session.is_website_user;const styleEl=document.createElement('style');styleEl.id="conditional_visibility";document.head.appendChild(styleEl);const conditionalEls=document.querySelectorAll('[data-visibility="conditional"]');for(const conditionalEl of conditionalEls){const selectors=conditionalEl.dataset.visibilitySelectors;styleEl.sheet.insertRule(`${selectors} { display: none !important; }`);}
for(const conditionalEl of conditionalEls){conditionalEl.classList.remove('o_conditional_hidden');}});return __exports;});;

/* /website/static/src/js/content/auto_hide_menu.js */
odoo.define('@website/js/content/auto_hide_menu',['@web/legacy/js/core/menu'],function(require){'use strict';let __exports={};const{initAutoMoreMenu}=require('@web/legacy/js/core/menu');document.addEventListener('DOMContentLoaded',async()=>{const header=document.querySelector('header#top');if(header){const topMenu=header.querySelector('#top_menu');if(header.classList.contains('o_no_autohide_menu')){topMenu.classList.remove('o_menu_loading');return;}
const unfoldable='.divider, .divider ~ li, .o_no_autohide_item, .js_language_selector';const excludedImagesSelector='.o_mega_menu, .o_offcanvas_logo_container, .o_lang_flag';const excludedImages=[...header.querySelectorAll(excludedImagesSelector)];const images=[...header.querySelectorAll('img')].filter((img)=>{excludedImages.forEach(node=>{if(node.contains(img)){return false;}});return img.matches&&!img.matches(excludedImagesSelector);});initAutoMoreMenu(topMenu,{unfoldable:unfoldable,images:images,loadingStyleClasses:['o_menu_loading']});}});return __exports;});;

/* /website/static/src/js/content/redirect.js */
odoo.define('@website/js/content/redirect',['@web/session'],function(require){'use strict';let __exports={};const{session}=require('@web/session');document.addEventListener('DOMContentLoaded',()=>{if(session.is_website_user){return;}
if(!window.frameElement){const frontendToBackendNavEl=document.querySelector('.o_frontend_to_backend_nav');if(frontendToBackendNavEl){frontendToBackendNavEl.classList.add('d-flex');frontendToBackendNavEl.classList.remove('d-none');}
const currentUrl=new URL(window.location.href);currentUrl.pathname=`/@${currentUrl.pathname}`;if(currentUrl.searchParams.get('enable_editor')||currentUrl.searchParams.get('edit_translations')){document.body.innerHTML='';window.location.replace(currentUrl.href);return;}
const backendEditBtnEl=document.querySelector('.o_frontend_to_backend_edit_btn');if(backendEditBtnEl){backendEditBtnEl.href=currentUrl.href;}}else{const backendUserDropdownLinkEl=document.getElementById('o_backend_user_dropdown_link');if(backendUserDropdownLinkEl){backendUserDropdownLinkEl.classList.add('d-none');backendUserDropdownLinkEl.classList.remove('d-flex');}
window.frameElement.dispatchEvent(new CustomEvent('OdooFrameContentLoaded'));}});return __exports;});;

/* /website/static/src/js/content/adapt_content.js */
odoo.define('@website/js/content/adapt_content',[],function(require){'use strict';let __exports={};document.addEventListener('DOMContentLoaded',()=>{const htmlEl=document.documentElement;const editTranslations=!!htmlEl.dataset.edit_translations;if(editTranslations){[...document.querySelectorAll('textarea')].map(textarea=>{if(textarea.value.indexOf('data-oe-translation-initial-sha')!==-1){textarea.classList.add('o_text_content_invisible');}});}});return __exports;});