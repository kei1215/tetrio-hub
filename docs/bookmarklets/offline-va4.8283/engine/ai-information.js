(function(root){
 // Accept both the engine's scalar HOLD state and replay snapshots that
 // expose {piece,locked}.  Do not confuse an empty container with a piece.
 function holdPiece(value){const piece=value&&typeof value==='object'?(value.piece??value.type??null):value;return typeof piece==='string'&&/^[IOTSZJL]$/i.test(piece)?piece.toLowerCase():null}
 function holdLocked(state){return state?.holdlocked===true||state?.hold?.locked===true}
 function holdAllowed(snapshot,profileAllowed=true){
  const state=snapshot?.game||snapshot,options=state?.setoptions||{},mods=options.zenith_mods||[];
  const legalMods=Array.isArray(mods)?mods:[];
  return profileAllowed&&options.display_hold!==false&&options.display_hold!==0&&!legalMods.includes('nohold')&&!legalMods.includes('nohold_reversed')&&!holdLocked(state);
 }
 function nextCount(options={},requested=null){const visible=options.display_next===false?0:Math.max(0,Math.min(6,Number(options.nextcount??5)||0));return requested===null||requested===undefined?visible:Math.min(visible,Math.max(0,Math.min(6,Math.floor(Number(requested)||0))))}
 function known(snapshot,requested=null){if(snapshot._aiSeedAccess===true)return snapshot.game.bag.slice();return Array.isArray(snapshot._aiKnownNext)?snapshot._aiKnownNext.slice():snapshot.game.bag.slice(0,nextCount(snapshot.game.setoptions,requested))}
 function prepare(snapshot,requested=null){const out=structuredClone(snapshot);if(out._aiSeedAccess===true){out._aiKnownNext=out.game.bag.slice();out._aiKnownCurrent=true;return out}const bag=known(snapshot,requested);out._aiKnownNext=bag;out._aiKnownCurrent=snapshot._aiKnownCurrent!==false;const s=out.game;s.bag=[...bag,...Array(16).fill('o')];s.bagex=[];s.bagid=0;if('lastGenerated'in s)s.lastGenerated=null;for(const key of ['impendingdamage','garbageareentries'])s[key]=(s[key]||[]).map(entry=>{const copy={...entry};for(const k of ['column','hole','hole_pos','position'])if(k in copy)copy[k]=Array.isArray(copy[k])?[4]:4;return copy});s.rng=42199;s.rngex=77317;s.lastcolumn=null;s.haschangedcolumn=false;s.setoptions.seed=42199;s.setoptions.seed_random=false;return out}
 function held(snapshot,before){if(before._aiSeedAccess===true){snapshot._aiSeedAccess=true;return prepare(snapshot)}snapshot._aiKnownCurrent=true;snapshot._aiKnownNext=!holdPiece(before.game.hold)?known(before).slice(1):known(before);return snapshot}
 function after(snapshot,before){if(before._aiSeedAccess===true){snapshot._aiSeedAccess=true;return prepare(snapshot)}const bag=known(before);snapshot._aiKnownCurrent=bag.length>0;snapshot._aiKnownNext=bag.slice(1);return snapshot}
 function modelStates(before,after,knowledge){const bag=known(knowledge);const holdVisible=knowledge.game.setoptions.display_hold!==false;return [{...before,hold:holdVisible?before.hold:null,bag},{...after,hold:holdVisible?after.hold:null,falling:{...after.falling,type:bag[0]||null},bag:bag.slice(1)}]}
 const api={holdPiece,holdLocked,holdAllowed,nextCount,known,prepare,held,after,modelStates};if(typeof module!=='undefined')module.exports=api;else root.LocalAIInformation=api;
})(typeof window==='undefined'?globalThis:window);
