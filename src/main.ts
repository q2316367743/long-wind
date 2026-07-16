import { createApp } from 'vue'
import { createPinia } from 'pinia';
import App from './App.vue'
import {router} from './plugin/router';
import { downloadTaskService } from '@/core/DownloadTaskService'

import 'virtual:uno.css'
import '@/assets/style/global.less';

// 额外引入图标库
void downloadTaskService.restoreInterruptedTasks()

createApp(App)
  .use(createPinia())
  .use(router)
  .mount('#app');
