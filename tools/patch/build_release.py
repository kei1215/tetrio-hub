#!/usr/bin/env python3
"""Build a new A/R/O desktop patch release from an existing release folder.

What it does (nothing is installed; it only writes the output folder):
  1. Unpacks QP-Patch-v{R,O,A}<old>-Source.zip.
  2. Rewrites O/transform.js:
       - embeds the replay board edit (docs/replay-edit) and the spin counter
         (docs/counter) and runs them only when CONFIG > REPLAY BOARD EDIT is ON
         (localStorage 'qp-replay-edit-v1' == '1', online client; it also runs while QP TOOLS are paused);
       - while it is ON, the patch's replay presentation (installReplayUI: QP replay
         background, hidden seek bar, Z/X/C presentation keys, TL intro/score effects,
         final FT screen) is skipped. The replay edit also turns off the native
         "next round" auto play. Player names stay (native TETR.IO display);
       - adds the ON/OFF entry to CONFIG > QP PATCH TOOLS.
  3. Points the browser reverse-HYPERSPEED music at the published tetrio-hub copy.
  4. Bumps package.json "update" and prepends a QP-CHANGELOG entry.
  5. Re-zips deterministically and rebuilds the 9 launchers
     (Mac .command / Linux .sh / Windows .cmd) with the new payload and SHA256.
  6. With --offline-src DIR (tools/patch/offline-src): replaces / adds the
     O/offline/* files found there (in the vO and vA zips, which carry the offline
     client), inlines extra-effects-schema.js at /*QP_EXTRA_SCHEMA*/, and loads
     revive-extra-effects.js from O/offline/index.html. The standalone mission
     editor is written as QP-Mission-Editor-v<EDITOR>.html.
  7. With --ai-src DIR (tools/patch/ai-src): replaces / adds the vA-only AI files
     under A/offline/ (same relative paths, e.g. engine/bot-ai.js, ai-loader.js).
     Only the vA zip carries A/offline; vR / vO are left untouched by it.

Usage:
  python3 build_release.py OLD_RELEASE_DIR NEW_RELEASE_DIR --old 8233 --new 8238 --hub DOCS_DIR \
      --port-2026-11-09 --offline-src tools/patch/offline-src
  From v4.8239 on (the v4.8233 base is gone), rebuild incrementally from the last build:
  python3 build_release.py release-v4.8239-ARO release-v4.8240-ARO --old 8239 --new 8240 --hub DOCS_DIR \\
      --offline-src tools/patch/offline-src --incremental --notes '- ...'
  AI changes (vA only): add --ai-src tools/patch/ai-src
"""
import argparse, base64, hashlib, io, json, os, re, shutil, stat, sys, zipfile
from pathlib import Path

KINDS = ('R', 'O', 'A')
OS_FILES = (('Mac', '.command', 'sh'), ('Linux', '.sh', 'sh'), ('Windows', '.cmd', 'cmd'))
OLD_MUSIC = 'https://kei1215.github.io/tetrio-patch/v4.8233/kugelhagel-overdrive.mp3'
NEW_MUSIC = 'https://kei1215.github.io/tetrio-hub/patch/v4.8233/kugelhagel-overdrive.mp3'
FIXED_TIME = (2026, 11, 9, 0, 0, 0)


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def replace_once(text, old, new, label):
    if text.count(old) != 1:
        raise SystemExit(f'{label}: anchor not found exactly once')
    return text.replace(old, new)


# CONFIG > QP PATCH TOOLS: REPLAY BOARD EDIT ON/OFF. Independent of installPatchDeleteUI so it
# also appears when the presentation rewrite is skipped for a newer client.
CONFIG_INSTALLER = r"""function qpReplayEditConfig(document, window) {
 if(window.location.protocol!=='https:')return;
 const install=()=>{
  if(document.getElementById('qp-replay-edit-toggle'))return;
  const account=document.getElementById('config_account');
  const config=account?.closest?.('[data-menuview="config"]')||document.querySelector('[data-menuview="config"]');
  if(!config)return;
  const template=document.getElementById('config_export')||account;
  const on=window.localStorage?.getItem('qp-replay-edit-v1')==='1';
  const node=document.createElement('div');node.id='qp-replay-edit-toggle';
  node.className=template?.className||'scroller_item scroller_item_config has_description ns rg_target_pri';
  node.setAttribute('role','button');node.tabIndex=0;
  const title=document.createElement('h1'),detail=document.createElement('p');
  title.textContent=on?'REPLAY BOARD EDIT: ON':'REPLAY BOARD EDIT: OFF';
  detail.textContent=on?'リプレイ盤面修正とスピンカウンターを使っています。リプレイ演出・シークバー非表示・次の自動再生は切っています。クリックで OFF':'クリックで ON。リプレイを止めるとその場面から操作でき、スピンカウンターも出ます(リプレイ演出は切ります)';
  node.append(title,detail);
  const toggle=()=>{if(on)window.localStorage?.removeItem('qp-replay-edit-v1');else window.localStorage?.setItem('qp-replay-edit-v1','1');window.location.reload()};
  node.addEventListener('click',event=>{event.preventDefault();event.stopImmediatePropagation();toggle()},true);
  node.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();toggle()}},true);
  let footer=document.getElementById('qp-patch-tools-footer');
  if(!footer){footer=document.createElement('div');footer.id='qp-patch-tools-footer';footer.className='scroller_block zero';const heading=document.createElement('h2');heading.className='ns';heading.textContent='QP PATCH TOOLS';heading.style.cssText='margin:.8em 0 .25em;color:#ff9866';footer.appendChild(heading);config.append(footer);}
  const after=document.getElementById('qp-patch-tools-toggle');
  if(after)after.after(node);else footer.after(node);
 };
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
}
"""


# TETR.IO client of 2026-11-09 renamed minified identifiers. Found by aligning the
# old and new tetrio.js token streams (names that patch anchors use). Sa/La/ha are
# the patch's own placeholders (replaced by adapt()) and must not be renamed.
CLIENT_RENAMES_2026_11_09 = {'Bc': 'Sc', 'El': 'Ml', 'Ht': 'Rt', 'Js': 'Zs', 'Mc': 'Ec', 'Ql': 'Yl',
                             'Qs': 'Ys', 'Ss': 'Bs', 'Yo': 'Qo', 'Zo': 'Jo'}


def port_client(src):
    """Adapt the anchors to the current TETR.IO client."""
    src = replace_once(src,
        "const clone=(src.match(/static FormatOptions\\(e,t,n=t\\.username\\)\\{if\\(t=([$\\w]+)\\(t\\),\"multi\"===e\\)/)||[])[1];",
        "const clone=(src.match(/static FormatOptions\\(e,t,n=t\\.username\\)\\{if\\(t=([$\\w]+)\\(t\\),\"multi\"===e\\)/)||[])[1];\n    const zenithBase=(src.match(/([$\\w]+)\\.Zenith=class extends \\1(?![$\\w])/)||[])[1];",
        'zenith alias')
    src = replace_once(src, "if(!replayData||!audio||!bool||!clone){", "if(!replayData||!audio||!bool||!clone||!zenithBase){", 'alias guard')
    src = replace_once(src, "'Qa.Zenith=class extends Qa'", "zenithBase+'.Zenith=class extends '+zenithBase", 'zenith check')
    src = replace_once(src, "const presentation = new Qa.Zenith(", "const presentation = new ${zenithBase}.Zenith(", 'zenith new')
    names = CLIENT_RENAMES_2026_11_09
    pat = re.compile(r'(?<![\w$])(' + '|'.join(map(re.escape, names)) + r')(?![\w$])')
    return pat.sub(lambda m: names[m.group(1)], src)


def patch_transform(src, edit_src, counter_src, port=False, hyper_fix=False):
    if 'qpReplayEditRunner' in src:
        raise SystemExit('transform.js already contains the replay edit')
    if port:
        src = port_client(src)
    if hyper_fix:
        src = fix_transform_hyper(src)
    # (a) Skip the replay presentation while the replay edit is ON.
    src = replace_once(src,
        " if (window.__qpReplayUIInstalled) return;",
        " if(window.location.protocol==='https:'&&window.localStorage?.getItem('qp-replay-edit-v1')==='1')return; // REPLAY BOARD EDIT is ON: keep the native replay screen\n"
        " if (window.__qpReplayUIInstalled) return;",
        'installReplayUI')
    # (b) Inject the runner and the CONFIG entry from patchQPReplayNaming, the outermost
    #     rewrite. It still applies when the presentation anchors no longer match a newer
    #     TETR.IO client (then the patch keeps the game unchanged, but the replay edit only
    #     relies on stable property names such as gsm / EjectState and still works).
    src = replace_once(src,
        "if(!updated){console.warn('[QP replay naming] No compatible download anchors found; client unchanged.');return src;}",
        "if(!updated){console.warn('[QP replay naming] No compatible download anchors found; client unchanged.');return src+qpReplayEditTail(src);}",
        'naming fallback')
    src = replace_once(src,
        "+patched+'\\n/* qp-replay-download-naming-v2 */';",
        "+patched+'\\n/* qp-replay-download-naming-v2 */'+qpReplayEditTail(src);",
        'naming return')
    runner = (
        "\n// REPLAY BOARD EDIT (tetrio-hub replay-edit + spin counter), embedded at build time.\n"
        "// Runs only on the online client when CONFIG > REPLAY BOARD EDIT is ON and QP TOOLS are not paused.\n"
        f"const QP_REPLAY_EDIT_SRC={json.dumps(edit_src, ensure_ascii=False)};\n"
        f"const QP_SPIN_COUNTER_SRC={json.dumps(counter_src, ensure_ascii=False)};\n"
        "function qpReplayEditRunner(){\n"
        " return ';(function(window,document){try{if(window.location.protocol!==\"https:\")return;var ls=window.localStorage;"
        "if(!ls||ls.getItem(\"qp-replay-edit-v1\")!==\"1\")return;"
        "window.__qpEmbedded=true;window.__scEmbedded=function(){'+QP_SPIN_COUNTER_SRC+'\\n};"
        "var run=function(){'+QP_REPLAY_EDIT_SRC+'\\n};"
        "if(document.readyState===\"loading\")document.addEventListener(\"DOMContentLoaded\",run,{once:true});else run();"
        "}catch(e){console.warn(\"[replay-edit]\",e)}})(window,document);';\n"
        "}\n"
        "function qpReplayEditTail(src){\n"
        " if(src.includes('/* qp-replay-edit-v1 */'))return '';\n"
        " return '\\n'+qpReplayEditRunner()+'\\n;('+qpReplayEditConfig.toString()+')(document,window);\\n/* qp-replay-edit-v1 */';\n"
        "}\n"
        + CONFIG_INSTALLER)
    return runner + src


EDITOR_VERSION = '6.5'
SCHEMA_MARK = '/*QP_EXTRA_SCHEMA*/'
EXTRA_TAG = '<script src="/revive-extra-effects.js"></script>'
MISSIONS_TAG = '<script src="/revive-missions.js"></script>'


# Text fixes for the frozen offline client (O/offline/client.js), applied with --offline-src.
# (old, new, expected count). The client itself is TETR.IO code and is not kept in this repo.
OFFLINE_CLIENT_FIXES = [
    # Reverse HYPERSPEED music: BgmPlaySmoothly only sets the current track after the mp3 is
    # decoded, so play() restarted the decode every frame until then (unplayable lag).
    # Start it once; if the game ends before the track starts, stop it as soon as it starts.
    ("let requested=null,loaded=false,loading=null,failed=false;",
     "let requested=null,loaded=false,loading=null,failed=false,starting=false,lastOn=0;", 2),
    # Two callers (local QP sync and the HYPER presentation) report every frame; a
    # stop while the game is still playing must last 0.3 s, so the music never flips
    # between the reverse track and the zenith score (each flip reloads the music).
    ("  if(!on||!reverse||!game.isPlaying?.()){stop(game,game.isPlaying?.()===true);return}\n  requested=game;",
     "  const playingNow=game.isPlaying?.()===true;\n"
     "  if(!on||!reverse||!playingNow){if(playingNow&&requested&&performance.now()-lastOn<300)return;stop(game,playingNow);return}\n"
     "  lastOn=performance.now();requested=game;", 2),
    ("const play=()=>{if(requested?.isPlaying?.()&&loaded&&audio.BgmGetCurrent()!==url)audio.BgmPlaySmoothly(url,.25)};",
     "const play=()=>{if(audio.BgmGetCurrent()===url){starting=false;return}if(starting||!requested?.isPlaying?.()||!loaded)return;starting=true;audio.BgmPlaySmoothly(url,.25)};", 2),
    ("const stop=(game,restart)=>{\n  if(!requested||key(requested)!==key(game))return;requested=null;\n"
     "  if(audio.BgmGetCurrent()===url){if(restart)audio.BgmPlaySmoothly('zenith',.25);else audio.BgmFadeOut(.2)}\n };",
     "const stop=(game,restart)=>{\n  if(!requested||key(requested)!==key(game))return;requested=null;\n"
     "  const pending=starting;starting=false;\n"
     "  if(audio.BgmGetCurrent()===url){if(restart)audio.BgmPlaySmoothly('zenith',.25);else audio.BgmFadeOut(.2)}\n"
     "  else if(pending){if(restart)audio.BgmPlaySmoothly('zenith',.25);else{let n=0;const timer=setInterval(()=>{if(requested||++n>150){clearInterval(timer);return}if(audio.BgmGetCurrent()===url){clearInterval(timer);audio.BgmFadeOut(.2)}},100)}}\n };", 2),
    # Result screen: a finished game is no longer in HYPERSPEED (no HYPER overlay, beat
    # sounds or HYPER music after the game ends), and the end cue is not played then.
    (' const game=this._GetSpeedrunViewGame();\n if(!game)return {state:"off",splits:[0,0,0,0,0,0,0,0,0],time:0,floor:1,progress:0};\n const state=game.getZenithSpeedrunState();',
     ' const game=this._GetSpeedrunViewGame();\n if(!game||game.isPlaying?.()===false)return {state:"off",splits:[0,0,0,0,0,0,0,0,0],time:0,floor:1,progress:0};\n const state=game.getZenithSpeedrunState();', 1),
    ('_PlaySpeedrunEnd(e){if(Sa.SePlay("zenith_speedrun_end"),!this._speedrunMeta.container)return;',
     '_PlaySpeedrunEnd(e){if(this._GetSpeedrunViewGame()?.isPlaying?.()===false||Sa.SePlay("zenith_speedrun_end"),!this._speedrunMeta.container)return;', 1),
]


def fix_offline_client(text):
    for old, new, count in OFFLINE_CLIENT_FIXES:
        if text.count(old) != count:
            raise SystemExit(f'O/offline/client.js fix anchor found {text.count(old)}x, expected {count}: {old[:60]}')
        text = text.replace(old, new)
    return text


# The online-client patch (O/transform.js, in every kind) carries the same reverse HYPERSPEED
# music code and the same speedrun view state once (replay / spectator presentation).
# Apply the same fixes there; the native end cue is left as it is online.
def fix_transform_hyper(text):
    for old, new, count in OFFLINE_CLIENT_FIXES:
        if '_PlaySpeedrunEnd' in old:
            continue
        if text.count(old) != 1:
            raise SystemExit(f'O/transform.js hyper fix anchor found {text.count(old)}x, expected 1: {old[:60]}')
        text = text.replace(old, new)
    return text


def load_offline_src(folder):
    """O/offline overrides: {file name: bytes}. The schema file itself is not shipped."""
    if folder is None:
        return {}
    schema = (folder / 'extra-effects-schema.js').read_text(encoding='utf-8')
    files = {}
    for f in sorted(folder.iterdir()):
        if f.name == 'extra-effects-schema.js' or not f.is_file() or f.name.startswith('.'):
            continue
        text = f.read_text(encoding='utf-8')
        if SCHEMA_MARK in text:
            if text.count(SCHEMA_MARK) != 1:
                raise SystemExit('schema marker in ' + f.name)
            text = text.replace(SCHEMA_MARK, schema)
        files[f.name] = text.encode('utf-8')
    return files


def load_ai_src(folder):
    """A/offline overrides for the vA zip: {relative path: bytes}."""
    if folder is None:
        return {}
    files = {}
    for f in sorted(folder.rglob('*')):
        rel = f.relative_to(folder).as_posix()
        if not f.is_file() or any(part.startswith('.') for part in rel.split('/')) or rel.endswith('.md'):
            continue
        files[rel] = f.read_bytes()
    if not files:
        raise SystemExit('no files in --ai-src ' + str(folder))
    return files


def patch_offline_index(text):
    if EXTRA_TAG in text:
        return text
    return replace_once(text, MISSIONS_TAG, EXTRA_TAG + MISSIONS_TAG, 'O/offline/index.html revive-missions tag')


EDITOR_WINDOW_MARK = 'qp-mission-editor-window-v1'
EDITOR_WINDOW_SRC = Path(__file__).with_name('app-src') / 'editor-window.js'


def add_editor_window(text):
    """Append the mission-editor window handler to O/local-main.js (once)."""
    if 'ipcMain' not in text:
        raise SystemExit('O/local-main.js: ipcMain not found')
    return replace_appended(text, EDITOR_WINDOW_MARK, EDITOR_WINDOW_SRC)



UPDATER_MARK = 'qp-patch-updater-v1'
UPDATE_CONFIG_MARK = 'qp-patch-update-config-v1'
APP_SRC = Path(__file__).with_name('app-src')
TAIL_RETURN = "+')(document,window);\\n/* qp-replay-edit-v1 */';"


def replace_appended(text, mark, source):
    """Append SOURCE (which starts with a /* MARK ... */ comment) at the end of TEXT,
    replacing the block a previous build appended (it always runs to the end of the file)."""
    block = source.read_text(encoding='utf-8')
    start = text.find('\n/* ' + mark)
    if start >= 0:
        text = text[:start]
    return text.rstrip('\n') + '\n' + block.lstrip('\n')


def refresh_embedded(text, edit_src, counter_src):
    """Incremental builds: put the current replay edit and spin counter into O/transform.js."""
    for name, src in (('QP_REPLAY_EDIT_SRC', edit_src), ('QP_SPIN_COUNTER_SRC', counter_src)):
        pattern = re.compile(r'^const ' + name + r'=.*;$', re.M)
        if len(pattern.findall(text)) != 1:
            raise SystemExit('O/transform.js: ' + name + ' line not found exactly once')
        line = 'const ' + name + '=' + json.dumps(src, ensure_ascii=False) + ';'
        text = pattern.sub(lambda _m: line, text)
    return text


def add_updater(text):
    """Append (or refresh) the patch updater (main process) in O/music-main.js, present in every kind."""
    return replace_appended(text, UPDATER_MARK, APP_SRC / 'patch-updater.js')


def add_update_config(text):
    """Add CONFIG > QP PATCH TOOLS > PATCH UPDATE to the online-client tail in O/transform.js."""
    if UPDATE_CONFIG_MARK in text:
        return text
    text = replace_once(text, TAIL_RETURN, "+')(document,window);\\n;('+qpPatchUpdateConfig.toString()+')(document,window);\\n/* qp-replay-edit-v1 */';", 'transform tail')
    return (APP_SRC / 'update-config.js').read_text(encoding='utf-8') + text


def build_zip(old_zip, new_zip, kind, old, new, edit_src, counter_src, port=False, offline=None, incremental=False, notes='', ai=None):
    offline = offline or {}
    ai = ai or {}
    out = io.BytesIO()
    with zipfile.ZipFile(old_zip) as zin, zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as zout:
        names = sorted(n for n in zin.namelist() if not n.endswith('/'))
        if len(names) != len(set(names)):
            raise SystemExit('duplicate entries in ' + old_zip.name)
        has_offline = 'O/offline/index.html' in names
        added = []
        if has_offline and offline:
            added = sorted('O/offline/' + n for n in offline if 'O/offline/' + n not in names)
            template = zin.getinfo('O/offline/revive-missions.js')
        has_ai = 'A/offline/ai-loader.js' in names
        if has_ai and ai:
            ai_added = sorted('A/offline/' + n for n in ai if 'A/offline/' + n not in names)
            ai_template = zin.getinfo('A/offline/engine/bot-ai.js')
            added = sorted(added + ai_added)
        elif ai and kind == 'A':
            raise SystemExit('vA zip without A/offline/ai-loader.js: ' + old_zip.name)
        for name in sorted(names + added):
            info = (ai_template if name.startswith('A/offline/') else template) if name in added else zin.getinfo(name)
            data = b'' if name in added else zin.read(name)
            base = name[len('O/offline/'):] if name.startswith('O/offline/') else None
            ai_base = name[len('A/offline/'):] if name.startswith('A/offline/') else None
            if has_ai and ai_base in ai:
                data = ai[ai_base]
            elif has_offline and base in offline:
                data = offline[base]
                if base == 'reverse-hyper-browser.js':
                    data = replace_once(data.decode('utf-8'), OLD_MUSIC, NEW_MUSIC, name).encode('utf-8')
            elif has_offline and offline and name == 'O/offline/client.js' and not incremental:
                data = fix_offline_client(data.decode('utf-8')).encode('utf-8')
            elif offline and name == 'O/local-main.js':
                data = add_editor_window(data.decode('utf-8')).encode('utf-8')
            elif has_offline and offline and name == 'O/offline/index.html':
                data = patch_offline_index(data.decode('utf-8')).encode('utf-8')
            elif name == 'O/transform.js':
                text = data.decode('utf-8')
                if not incremental:
                    text = patch_transform(text, edit_src, counter_src, port, hyper_fix=bool(offline))
                else:
                    text = refresh_embedded(text, edit_src, counter_src)
                if offline:
                    text = add_update_config(text)
                data = text.encode('utf-8')
            elif offline and name == 'O/music-main.js':
                data = add_updater(data.decode('utf-8')).encode('utf-8')
            elif name == 'O/offline/reverse-hyper-browser.js' and not incremental:
                data = replace_once(data.decode('utf-8'), OLD_MUSIC, NEW_MUSIC, name).encode('utf-8')
            elif name == 'package.json':
                pkg = json.loads(data)
                if pkg.get('kind') != kind or pkg.get('update') != int(old):
                    raise SystemExit(f'unexpected package.json in {old_zip.name}: {pkg}')
                pkg['update'] = int(new)
                data = json.dumps(pkg).encode('utf-8')
            elif name == 'QP-CHANGELOG.txt' and incremental:
                data = (f'v4.{new}\n{notes}\n' + data.decode('utf-8')).encode('utf-8')
            elif name == 'QP-CHANGELOG.txt':
                entry = (f'v4.{new} replay board edit' + (' / TETR.IO 2026-11-09 client' if port else '')
                         + (' / revive mission extra effects' if offline else '') + '\n'
                         + ('- 2026-11-09 の TETR.IO 更新(内部の名前の付け替え)に合わせて書き換え位置を更新。\n' if port else '')
                         + ('- オフラインQP: 裏HYPERSPEED曲の再生でラグが出る問題(曲の変換を毎フレームやり直していた)を修正。\n'
                            '  リザルト画面では表・裏とも HYPER(演出・曲・終了音)を止める。ブラウザ版でも裏HYPERSPEED曲が鳴る。\n'
                            '  オンライン用の書き換え(リプレイ・観戦の表示)にも同じ修正を当てた。\n'
                            '- ミッション: 失敗(時間切れ/リセット判定)で即死の設定、達成時に伸ばす距離(0〜1000m)と送る火力(0〜1000)。\n'
                            '  ランクを固定したミッションは MOD があってもそのランクのまま(自動のときだけ A)。\n'
                            '- 強制ゴミのテンプレートを盤面サイズのマス目で描画(なぞって設置・削除)、ゴミを受けた時に発動、盤面にブロックを置く効果、\n'
                            '  洗濯機ミッション(J/L を4回回して元の位置に戻ったら1周)。B2B ミッションが進まない問題を修正(B2B が切れたら0に戻る)。\n' if offline else '')
                         + ('- リバイブミッションに追加効果(複数同時可):消せない段の追加・削除、強制ゴミ(即時上昇・地形変更・ゴミ予測バー、\n'
                            '  地形指定なし/シード由来のパターン・形・テンプレート、ボム)、盤面の高さ、直列率、Spinルール、ミノの増減、I5。\n'
                            '  盤面の高さ・直列率・Spin・ミノは「ミッション終了時/復活し終えた時/ラン中」から戻すタイミングを選べる。\n'
                            f'- ミッションエディタ v{EDITOR_VERSION}(v5.3 の設定項目を維持)に「追加効果」タブを追加。\n' if offline else '')
                         + 
                         '- CONFIG > QP PATCH TOOLS に REPLAY BOARD EDIT (ON/OFF) を追加。ON のとき、リプレイを止めるとその場面から操作でき、\n'
                         '  スピンカウンター(SPIN・T-SPIN・QUAD)も表示する。リプレイ演出・シークバー非表示・次の自動再生は切る。\n'
                         '- ブラウザ用リバースHYPERSPEED曲の参照先を kei1215.github.io/tetrio-hub に変更。\n\n')
                data = (entry + data.decode('utf-8')).encode('utf-8')
            zi = zipfile.ZipInfo(name, FIXED_TIME)
            zi.compress_type = zipfile.ZIP_DEFLATED
            zi.external_attr = info.external_attr
            zi.create_system = info.create_system
            zout.writestr(zi, data, compresslevel=9)
    raw = out.getvalue()
    new_zip.write_bytes(raw)
    return raw


def build_launcher(old_file, new_file, flavor, old, new, old_sha, payload):
    raw = old_file.read_bytes()
    eol = b'\r\n' if flavor == 'cmd' else b'\n'
    begin = (b':: QP_PAYLOAD_BEGIN' if flavor == 'cmd' else b'# QP_PAYLOAD_BEGIN') + eol
    end = (b':: QP_PAYLOAD_END' if flavor == 'cmd' else b'# QP_PAYLOAD_END') + eol
    i = raw.find(begin)
    if i < 0 or raw.count(begin) != 1:
        raise SystemExit('payload marker not found in ' + old_file.name)
    header = raw[:i].decode('ascii')
    if header.count(old_sha) != 1:
        raise SystemExit('payload sha not found in header of ' + old_file.name)
    new_sha = sha256(payload)
    header = header.replace(old_sha, new_sha).replace('4.' + old, '4.' + new).replace('4' + old, '4' + new)
    # The new payload SHA-256 may contain the old number by chance; check the rest only.
    if old in header.replace(new_sha, ''):
        raise SystemExit('old version left in header of ' + old_file.name)
    b64 = base64.b64encode(payload).decode('ascii')
    prefix = '' if flavor == 'cmd' else '# '
    lines = ''.join(prefix + b64[k:k + 120] + eol.decode() for k in range(0, len(b64), 120))
    data = header.encode('ascii') + begin + lines.encode('ascii') + end
    new_file.write_bytes(data)
    new_file.chmod(old_file.stat().st_mode & 0o777)
    # Re-extract exactly like the launcher does and compare.
    text = data.decode('ascii').split(eol.decode())
    a = text.index(begin.decode().rstrip('\r\n')) + 1
    b = text.index(end.decode().rstrip('\r\n'))
    got = base64.b64decode(''.join(line[len(prefix):] for line in text[a:b]))
    if got != payload:
        raise SystemExit('round-trip check failed for ' + new_file.name)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('old_dir', type=Path)
    ap.add_argument('new_dir', type=Path)
    ap.add_argument('--old', required=True)
    ap.add_argument('--new', required=True)
    ap.add_argument('--hub', required=True, type=Path, help='tetrio-hub/docs')
    ap.add_argument('--port-2026-11-09', dest='port', action='store_true', help='adapt anchors to the TETR.IO client of 2026-11-09')
    ap.add_argument('--offline-src', type=Path, help='folder with changed O/offline/* files (tools/patch/offline-src)')
    ap.add_argument('--incremental', action='store_true', help='OLD is already a build of this script (v4.8239+): only re-overlay O/offline, keep transform.js and client.js')
    ap.add_argument('--notes', default='', help='changelog lines for --incremental')
    ap.add_argument('--ai-src', type=Path, help='folder with changed vA-only A/offline/* files (tools/patch/ai-src)')
    ap.add_argument('--manifest', type=Path, help='write the in-app updater manifest (docs/patch/latest.json)')
    a = ap.parse_args()
    offline = load_offline_src(a.offline_src)
    ai = load_ai_src(a.ai_src)
    if a.new_dir.exists():
        raise SystemExit('output folder already exists: ' + str(a.new_dir))
    edit_src = (a.hub / 'replay-edit/tetrio-replay-edit.js').read_text(encoding='utf-8')
    counter_src = (a.hub / 'counter/tetrio-spin-counter.js').read_text(encoding='utf-8')
    a.new_dir.mkdir(parents=True)
    sums = {}
    for kind in KINDS:
        old_zip = a.old_dir / f'QP-Patch-v{kind}4.{a.old}-Source.zip'
        new_zip = a.new_dir / f'QP-Patch-v{kind}4.{a.new}-Source.zip'
        old_sha = sha256(old_zip.read_bytes())
        payload = build_zip(old_zip, new_zip, kind, a.old, a.new, edit_src, counter_src, a.port, offline, a.incremental, a.notes, ai if kind == 'A' else None)
        sums[new_zip.name] = sha256(payload)
        for osname, ext, flavor in OS_FILES:
            old_file = a.old_dir / f'tetrio-patch-{osname}-v{kind}4.{a.old}{ext}'
            new_file = a.new_dir / f'tetrio-patch-{osname}-v{kind}4.{a.new}{ext}'
            build_launcher(old_file, new_file, flavor, a.old, a.new, old_sha, payload)
            sums[new_file.name] = sha256(new_file.read_bytes())
        print(kind, 'ok', len(payload))
    if offline:
        extra = f'QP-Mission-Editor-v{EDITOR_VERSION}.html'
        (a.new_dir / extra).write_bytes(offline['mission-editor.html'])
        sums[extra] = sha256(offline['mission-editor.html'])
    for extra in () if offline else ('QP-Mission-Editor-v6.4.html',):
        if (a.old_dir / extra).exists():
            shutil.copy2(a.old_dir / extra, a.new_dir / extra)
            sums[extra] = sha256((a.new_dir / extra).read_bytes())
    (a.new_dir / 'SHA256SUMS.txt').write_text(''.join(f'{v}  {k}\n' for k, v in sorted(sums.items())), encoding='utf-8')
    if a.manifest:
        # Read by CONFIG > PATCH UPDATE (app-src/patch-updater.js). Launchers only.
        files = {k: {'sha256': v, 'size': (a.new_dir / k).stat().st_size} for k, v in sorted(sums.items()) if k.startswith('tetrio-patch-')}
        a.manifest.parent.mkdir(parents=True, exist_ok=True)
        a.manifest.write_text(json.dumps({'version': f'4.{a.new}', 'base': f'https://github.com/kei1215/tetrio-hub/releases/download/patch-v4.{a.new}/', 'files': files}, indent=1) + '\n', encoding='utf-8')
        print('manifest', a.manifest)
    print('done', a.new_dir)


if __name__ == '__main__':
    main()
