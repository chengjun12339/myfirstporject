import type { Ref } from 'vue'
import type { IPersonConfig } from '@/types/storeType'
import { storeToRefs } from 'pinia'
import { v4 as uuidv4 } from 'uuid'
import { inject, ref, toRaw } from 'vue'
import { useI18n } from 'vue-i18n'
import { useToast } from 'vue-toast-notification'
import * as XLSX from 'xlsx'
import { loadingKey } from '@/components/Loading'
import i18n from '@/locales/i18n'
import useStore from '@/store'
import { addOtherInfo } from '@/utils'
import { readFileBinary, readLocalFileAsArraybuffer } from '@/utils/file'
import { tableColumns } from './columns'
import ImportExcelWorker from './importExcel.worker?worker'
import { deletePerson as deletePersonApi } from '@/api/lottery'

type IBasePersonConfig = Pick<IPersonConfig, 'uid' | 'name' | 'department' | 'identity' | 'avatar'>

export function useViewModel({ exportInputFileRef }: { exportInputFileRef: Ref<HTMLInputElement> }) {
    const { t } = useI18n()
    const baseUrl = import.meta.env.BASE_URL.replace('./', '/')
    const toast = useToast()
    const worker: Worker | null = new ImportExcelWorker()
    const loading = inject(loadingKey)
    const personConfig = useStore().personConfig
    const { getAllPersonList: allPersonList, getAlreadyPersonList: alreadyPersonList } = storeToRefs(personConfig)
    const tableColumnList = tableColumns({ handleDeletePerson: delPersonItem })
    const addPersonModalVisible = ref(false)
    const singlePersonData = ref<IBasePersonConfig>({
        uid: '',
        name: '',
        department: '',
        avatar: '',
        identity: '',
    })

    async function getExcelTemplateContent() {
        const locale = i18n.global.locale.value
        if (locale === 'zhCn') {
            return await readLocalFileAsArraybuffer(`${baseUrl}人口登记表-zhCn.xlsx`)
        } else {
            return await readLocalFileAsArraybuffer(`${baseUrl}personListTemplate-en.xlsx`)
        }
    }

    function sendWorkerMessage(message: any) {
        if (worker) {
            worker.postMessage(message)
        }
    }

    async function startWorker(data: string) {
        loading?.show()
        sendWorkerMessage({ type: 'start', data, templateData: await getExcelTemplateContent() })
    }

    async function handleFileChange(e: Event) {
        if (worker) {
            worker.onmessage = (e) => {
                if (e.data.type === 'done') {
                    personConfig.resetPerson()
                    personConfig.addNotPersonList(e.data.data)
                    toast.open({
                        message: t('error.importSuccess'),
                        type: 'success',
                        position: 'top-right',
                    })
                    clearFileInput()
                }
                if (e.data.type === 'error') {
                    if (e.data.message === 'not right template') {
                        toast.open({
                            message: t('error.excelFileError'),
                            type: 'error',
                            position: 'top-right',
                        })
                        return
                    }
                    toast.open({
                        message: e.data.message || t('error.importFail'),
                        type: 'error',
                        position: 'top-right',
                    })
                }
                loading?.hide()
            }
        }
        const dataBinary = await readFileBinary(((e.target as HTMLInputElement).files as FileList)[0]!)
        startWorker(dataBinary)
    }

    function clearFileInput() {
        if (exportInputFileRef.value) {
            exportInputFileRef.value.value = ''
        }
    }

    function downloadTemplate() {
        const templateFileName = i18n.global.t('data.xlsxName')
        const fileUrl = `${baseUrl}${templateFileName}`
        fetch(fileUrl)
            .then(res => res.blob())
            .then((blob) => {
                const url = window.URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url
                a.download = templateFileName
                a.click()
                toast.open({
                    message: t('error.downloadSuccess'),
                    type: 'success',
                    position: 'top-right',
                })
            })
    }

    function exportData() {
        let data = JSON.parse(JSON.stringify(allPersonList.value))
        for (let i = 0; i < data.length; i++) {
            delete data[i].x
            delete data[i].y
            delete data[i].id
            delete data[i].createTime
            delete data[i].updateTime
            delete data[i].prizeId
            if (data[i].isWin) {
                data[i].isWin = i18n.global.t('data.yes')
            } else {
                data[i].isWin = i18n.global.t('data.no')
            }
            data[i].prizeTime = data[i].prizeTime.join(',')
            data[i].prizeName = data[i].prizeName.join(',')
        }
        let dataString = JSON.stringify(data)
        dataString = dataString
            .replaceAll(/uid/g, i18n.global.t('data.number'))
            .replaceAll(/isWin/g, i18n.global.t('data.isWin'))
            .replaceAll(/department/g, i18n.global.t('data.department'))
            .replaceAll(/name/g, i18n.global.t('data.name'))
            .replaceAll(/identity/g, i18n.global.t('data.identity'))
            .replaceAll(/prizeName/g, i18n.global.t('data.prizeName'))
            .replaceAll(/prizeTime/g, i18n.global.t('data.prizeTime'))

        data = JSON.parse(dataString)

        if (data.length > 0) {
            const dataBinary = XLSX.utils.json_to_sheet(data)
            const dataBinaryBinary = XLSX.utils.book_new()
            XLSX.utils.book_append_sheet(dataBinaryBinary, dataBinary, 'Sheet1')
            XLSX.writeFile(dataBinaryBinary, 'data.xlsx')
            toast.open({
                message: t('error.exportSuccess'),
                type: 'success',
                position: 'top-right',
            })
        }
    }

    function resetData() {
        personConfig.resetAlreadyPerson()
    }

    function deleteAll() {
        personConfig.deleteAllPerson()
    }

    async function delPersonItem(row: IPersonConfig) {
        try {
            await deletePersonApi({ id: row.id })
            personConfig.deletePerson(row)
            toast.open({
                message: t('error.deleteSuccess'),
                type: 'success',
                position: 'top-right',
            })
        } catch (e: any) {
            toast.open({
                message: e?.message || t('error.deleteFail'),
                type: 'error',
                position: 'top-right',
            })
        }
    }

    function writePerson(raw: Partial<IPersonConfig>) {
        const backendId = raw.id
        const backendUid = raw.uid
        const personData = addOtherInfo([{ ...raw }])
        const person = personData[0]
        person.id = backendId ?? person.id ?? uuidv4()
        person.uid = backendUid ?? person.uid
        personConfig.addOnePerson(personData)
    }

    function addOnePerson(addOnePersonDrawerRef: any, event: any) {
        event.preventDefault()
        writePerson(toRaw(singlePersonData.value))
        addOnePersonDrawerRef.closeDrawer()
        singlePersonData.value = {} as IBasePersonConfig
    }

    /**
     * SSE 推送入口
     * 关键修复：
     * 1) 先按 id / uid 去重 —— 删除后 SSE 重连 replay 的老数据会被直接跳过，不再弹警告
     * 2) uid 不再作为硬门槛（它本来就由 addOtherInfo 生成），只校验 name
     * 3) 非致命问题降级为 console.warn，避免 toast 刷屏
     */
    function addPersonFromBackend(person: Partial<IPersonConfig> & Record<string, any>) {
        // ① 去重（必须在所有校验之前）
        const dup = allPersonList.value.find(
            p =>
                (person.id && p.id === person.id) ||
                (person.uid && p.uid === person.uid),
        )
        if (dup) {
            // SSE 重放已存在的数据：静默跳过即可
            if (import.meta.env.DEV) {
                console.log('[SSE] 已存在，跳过', person.id ?? person.uid)
            }
            return
        }

        // ② 字段别名归一化（防后端字段名不同）
        const normalized: Partial<IPersonConfig> = {
            ...person,
            id: person.id ?? person.personId ?? person._id,
            uid: person.uid ?? person.userId ?? person.number ?? person.code,
            name: person.name ?? person.userName ?? person.realName ?? person.personName,
            department: person.department ?? person.dept ?? person.departmentName,
            identity: person.identity ?? person.identityType,
            avatar: person.avatar ?? person.avatarUrl,
        }

        // ③ 仅 name 为硬性要求，uid 缺失由 addOtherInfo 兜底
        if (!normalized.name) {
            console.warn('[SSE] PERSON_ADDED 缺少 name，已忽略：', person)
            return
        }
        if (!normalized.uid) {
            console.warn('[SSE] PERSON_ADDED 缺少 uid，将自动生成：', normalized.id, normalized.name)
        }

        writePerson(normalized)
    }

    return {
        resetData,
        deleteAll,
        handleFileChange,
        exportData,
        alreadyPersonList,
        allPersonList,
        tableColumnList,
        addOnePerson,
        addPersonModalVisible,
        singlePersonData,
        downloadTemplate,
        addPersonFromBackend,
    }
}