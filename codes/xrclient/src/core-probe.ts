import init, { coreVersion, evaluate, instantiateItem } from './wasm/pkg/foldlings_core.js';
import fractionTemplate from '../../content/contoh/tpl.fr.add_like.v1.json?raw';

/**
 * Week 0 probe: proves foldlings-core runs in the headset as WebAssembly.
 * The same template and seed must give the same item as the native build.
 */
export async function runCoreProbe(): Promise<void> {
  try {
    await init();
    console.info(`[core-probe] version ${coreVersion()}`);
    console.info(`[core-probe] 0.1 + 0.2 = ${evaluate('0.1 + 0.2')}`);
    console.info(`[core-probe] 12500 * 80 = ${evaluate('12500 * 80')}`);
    console.info(`[core-probe] item seed 7 ${instantiateItem(fractionTemplate, 7)}`);
  } catch (error) {
    console.error('[core-probe] failed', error);
  }
}
