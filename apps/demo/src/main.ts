import { createApp } from 'vue'
import { registerDocsEditor } from '@docs-editor/element'
import App from './App.vue'
import './styles/index.css'

if (typeof window !== 'undefined') {
  registerDocsEditor()
}

createApp(App).mount('#app')
