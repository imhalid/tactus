# tactus

Svelte ve Astro için **kodla üretilmiş** premium UI ses efektleri. Sıfır ses dosyası, sıfır bağımlılık (~7 KB gzip). Her şey Web Audio API ile sentezleniyor.

## Neden klasik "bip" gibi durmuyor

- **Struck-object sentezi:** her ses, marimba/cam gibi vurulmuş bir nesnenin kısmi tonlarından (1 : 4 : 10 ahşap, 1 : 2.76 : 5.4 cam) oluşur; tizler bastan daha hızlı söner.
- **Yumuşak envelope:** hiçbir ses tam seviyede başlamaz (3–10 ms attack) → tıkırtı yok. Sönüm exponential.
- **Pentatonik skala:** hover/select/drag sesleri hep uyumlu notalardan gelir, üst üste bindiğinde bile kulağı tırmalamaz.
- **Oda yankısı:** gürültüden üretilen küçük, karanlık bir oda impulse'u (cozy his buradan).
- **Master zincir:** 42 Hz highpass → -3 dB high-shelf → yumuşak kompresör/limiter.
- **İnsanileştirme:** her çalışta ±7 cent ve ±%8 seviye; hover'da round-robin notalar. Makineli tüfek etkisi yok.
- **Stereo konum:** ses, elemanın ekrandaki x konumuna göre hafifçe panlanır.

Temalar: `cozy` (ahşap/marimba, sıcak), `crystal` (cam, Apple "tink" ailesi), `felt` (keçe, neredeyse sessiz).

## Kurulum

```bash
npm i tactus     # (veya: npm i ./sound-library)
```

## Astro

```astro
---
import Tactus from 'tactus/astro';
---
<body>
  <slot />
  <Tactus theme="cozy" volume={0.7} />
</body>
```

```html
<button data-sound="button">Kaydet</button>
<a href="/x" data-sound="link" data-sound-click="success">Git</a>
<div data-sound="card" data-sound-hover="off">Kart</div>
```

`data-sound-{hover,press,release,click,focus,change,dragstart,drop,…}` ile tek tek override edilir, `"off"` susturur. Dinleyiciler `document` üzerinde olduğu için View Transitions ile sorunsuz çalışır.

## Svelte (4 ve 5)

```svelte
<script>
  import { sound, soundAttach, play, muted, setMuted } from 'tactus/svelte';
</script>

<button use:sound={'button'}>Kaydet</button>
<div use:sound={{ preset: 'card', click: 'success' }}>…</div>
<button {@attach soundAttach('button')}>Svelte 5 attachment</button>

<button onclick={() => setMuted(!$muted)}>{$muted ? 'Aç' : 'Sustur'}</button>
```

## Presetler

`button` `link` `card` `toggle` `tab` `input` `typing` `draggable` `dropzone` `sortable` `confirm` `quiet`

- `button`: hover tiki + yumuşak basış + net bırakış (klavye ile aktive edilince tek `tap`).
- `toggle`: `<input type=checkbox>` (change) ve `role="switch"` (click) için açık/kapalı sesi.
- `sortable`: svelte-dnd-action `consider` / `finalize` olaylarına bağlı.

## Doğrudan kullanım

```ts
import { play, configure } from 'tactus';

play('tap');
play('select', { step: 7 });        // skalada nota seç
play('slide', { value: 0.4 });      // slider
configure({ theme: 'crystal', volume: 0.6, spatial: 0.3, humanize: 0.5 });
```

Sesler: `hover press release tap toggleOn toggleOff select focus pop slide type open close swipe dragStart dragMove dragOver drop dragCancel success error warning notify`

## Kendi sesini / temanı ekle

```ts
import { registerSound, registerTheme, cozy } from 'tactus';
import { modal, tone, noise } from 'tactus';

registerTheme({ ...cozy, name: 'mine', root: 220, reverb: 0.4 });
registerSound('ding', (c) => {
  const o = c.out({ cutoff: c.theme.cutoff, send: c.theme.reverb });
  // c.note(step) · c.semi(n) · c.t · c.vel · c.theme.partials
});
```

## Geliştirme

```bash
npm i && npm run build
npm run verify   # 3 tema × 23 sesi Chromium'da offline render eder, WAV'ları ./renders'a yazar, peak/tıkırtı/parlaklık raporu basar
npm run demo     # demo/index.html üretir (çift tıkla aç, dinle)
```

Tarayıcılar ilk kullanıcı etkileşimine kadar ses çalmayı engeller; `tactus` ilk `pointerdown`/`keydown`'da AudioContext'i uyandırır, ondan önceki hover'lar sessiz kalır (bilinçli).
