import {PostDownload} from "@/domain/PostDownload";
import {
  Button,
  Checkbox,
  DialogPlugin,
  Form,
  FormItem,
  Input,
  InputNumber,
  Space,
  Textarea
} from "tdesign-vue-next";
import { useSettingStore} from "@/store";

export async function openPostDownloadDialog(): Promise<void> {
  const settingsStore = useSettingStore()

  const data = ref<PostDownload>({
    taskType: 'http',
    url: '',
    name: '',
    threads: settingsStore.state.maxDownloadSlices,
    folder: settingsStore.state.downloadPath,
    userAgent: settingsStore.state.userAgent,
    authorization: '',
    referer: '',
    cookie: '',
    proxy: settingsStore.state.proxy || '',
    jump: true
  })
  const advance = ref(false);

  const handleCancel = () => {
    dp.destroy();
  }
  const handleSubmit = () => {

    // TODO: 提交下载任务
    dp.destroy();
  }

  const dp = DialogPlugin({
    header: '链接任务',
    placement: 'center',
    width: '700px',
    default: () => <Form data={data.value}>
      <FormItem labelAlign="top">
        <Textarea v-model={data.value.url} autosize={{minRows: 3, maxRows: 5}}
                  placeholder="请输入下载链接，支持以下格式：
· 单个链接：直接粘贴一个下载地址
· 多个链接：每行一个链接，系统将自动创建多个下载任务
· 支持HTTP/HTTPS、M3U8、磁力链接等"></Textarea>
      </FormItem>
      <Form layout={'inline'} class={'mb-8px'}>
        <FormItem label={'重命名'}>
          <Input v-model={data.value.name} placeholder="选填，M3U8文件默认使用时间戳命名，多个文件时自动加上序号"></Input>
        </FormItem>
        <FormItem label={'分片数'}>
          <InputNumber v-model={data.value.threads}></InputNumber>
        </FormItem>
      </Form>
      <FormItem label={'存储路径'}>
        <Input v-model={data.value.folder}></Input>
      </FormItem>
      {advance.value && <>
        <FormItem label={'User-Agent'}>
          <Textarea v-model={data.value.userAgent} autosize={{minRows: 2, maxRows: 3}}></Textarea>
        </FormItem>
        <FormItem label={'Authorization'}>
          <Textarea v-model={data.value.authorization} autosize={{minRows: 2, maxRows: 3}}></Textarea>
        </FormItem>
        <FormItem label={'Referer'}>
          <Textarea v-model={data.value.referer} autosize={{minRows: 2, maxRows: 3}}></Textarea>
        </FormItem>
        <FormItem label={'Cookie'}>
          <Textarea v-model={data.value.cookie} autosize={{minRows: 2, maxRows: 3}}></Textarea>
        </FormItem>
        <FormItem label={'代理'}>
          <Textarea v-model={data.value.proxy} autosize={{minRows: 2, maxRows: 3}}></Textarea>
        </FormItem>
      </>}
    </Form>,
    footer: () => <div class={'flex justify-between items-center'}>
      <Checkbox v-model={advance.value}>高级设置</Checkbox>
      <Space size={'small'}>
        <Button theme={'default'} onClick={handleCancel}>取消</Button>
        <Button theme={'primary'} onClick={handleSubmit}>提交</Button>
      </Space>
    </div>
  })
}
