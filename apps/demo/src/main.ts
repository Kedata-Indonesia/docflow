import { createApp } from 'vue'
import { registerDocsEditor } from '@kedata-indonesia/docflow-element'
import '@kedata-indonesia/docflow-vue/style.css'
import App from './App.vue'
import './styles/index.css'

if (typeof window !== 'undefined') {
  registerDocsEditor()
}

createApp(App).mount('#app')
