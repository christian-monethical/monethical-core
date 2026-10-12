import { render } from 'preact';
import { App } from './app/App';
import { initSession } from './auth/session';
import { initLang } from './i18n';
import './styles/index.css';

async function boot(): Promise<void> {
  await initLang(); // lazy-loads English only when it was the stored choice
  const root = document.getElementById('app');
  if (!root) throw new Error('#app not found');
  render(<App />, root);
  void initSession();
}

void boot();
