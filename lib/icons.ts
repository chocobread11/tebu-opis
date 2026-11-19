// Preserve existing icon APIs while rendering the preset's Hugeicons library.
import { defineComponent, h } from 'vue'
import { HugeiconsIcon, type IconArray } from '@hugeicons/vue'
import { ArrowDownLeft as ArrowDownLeftData, ArrowLeft as ArrowLeftData, ArrowRight as ArrowRightData, ArrowUpRight as ArrowUpRightData, BookOpen as BookOpenData, CalendarDays as CalendarDaysData, Camera as CameraData, Check as CheckData, CheckCircle as CheckCircle2Data, ChevronDown as ChevronDownData, ChevronLeft as ChevronLeftData, ChevronRight as ChevronRightData, ClipboardCheck as ClipboardCheckData, Copy as CopyData, ExternalLink as ExternalLinkData, History as HistoryData, Leaf as LeafData, LoaderCircle as LoaderCircleData, MapPin as MapPinData, MessageCircle as MessageCircleData, Minus as MinusData, PackageCheck as PackageCheckData, Pencil as PencilData, Plus as PlusData, QrCode as QrCodeData, ReceiptText as ReceiptTextData, RefreshCw as RefreshCwData, Settings as SettingsData, ShieldCheck as ShieldCheckData, ShoppingBag as ShoppingBagData, Snowflake as SnowflakeData, Sprout as SproutData, Ticket as TicketData, Trash2 as Trash2Data, CloudUpload as UploadCloudData, Users as UsersData, Wallet as WalletData, X as XData, Zap as ZapData } from '@hugeicons/core-free-icons'

function icon(data: typeof LeafData, name: string) {
  const glyph: IconArray = data.map(([tag, attributes]) => [tag, { ...attributes }])
  return defineComponent({
    name,
    inheritAttrs: false,
    props: { size: { type: [Number, String], default: 16 }, strokeWidth: { type: [Number, String], default: 1.6 } },
    setup: (props, { attrs }) => () => h(HugeiconsIcon, { ...attrs, icon: glyph, size: props.size, strokeWidth: Number(props.strokeWidth) }),
  })
}

export const ArrowDownLeft = icon(ArrowDownLeftData, 'ArrowDownLeft')
export const ArrowLeft = icon(ArrowLeftData, 'ArrowLeft')
export const ArrowRight = icon(ArrowRightData, 'ArrowRight')
export const ArrowUpRight = icon(ArrowUpRightData, 'ArrowUpRight')
export const BookOpen = icon(BookOpenData, 'BookOpen')
export const CalendarDays = icon(CalendarDaysData, 'CalendarDays')
export const Camera = icon(CameraData, 'Camera')
export const Check = icon(CheckData, 'Check')
export const CheckCircle2 = icon(CheckCircle2Data, 'CheckCircle2')
export const ChevronDown = icon(ChevronDownData, 'ChevronDown')
export const ChevronLeft = icon(ChevronLeftData, 'ChevronLeft')
export const ChevronRight = icon(ChevronRightData, 'ChevronRight')
export const ClipboardCheck = icon(ClipboardCheckData, 'ClipboardCheck')
export const Copy = icon(CopyData, 'Copy')
export const ExternalLink = icon(ExternalLinkData, 'ExternalLink')
export const History = icon(HistoryData, 'History')
export const Leaf = icon(LeafData, 'Leaf')
export const LoaderCircle = icon(LoaderCircleData, 'LoaderCircle')
export const MapPin = icon(MapPinData, 'MapPin')
export const MessageCircle = icon(MessageCircleData, 'MessageCircle')
export const Minus = icon(MinusData, 'Minus')
export const PackageCheck = icon(PackageCheckData, 'PackageCheck')
export const Pencil = icon(PencilData, 'Pencil')
export const Plus = icon(PlusData, 'Plus')
export const QrCode = icon(QrCodeData, 'QrCode')
export const ReceiptText = icon(ReceiptTextData, 'ReceiptText')
export const RefreshCw = icon(RefreshCwData, 'RefreshCw')
export const ShieldCheck = icon(ShieldCheckData, 'ShieldCheck')
export const ShoppingBag = icon(ShoppingBagData, 'ShoppingBag')
export const Snowflake = icon(SnowflakeData, 'Snowflake')
export const Sprout = icon(SproutData, 'Sprout')
export const Ticket = icon(TicketData, 'Ticket')
export const Trash2 = icon(Trash2Data, 'Trash2')
export const UploadCloud = icon(UploadCloudData, 'UploadCloud')
export const Users = icon(UsersData, 'Users')
export const Wallet = icon(WalletData, 'Wallet')
export const X = icon(XData, 'X')
export const Zap = icon(ZapData, 'Zap')

export const Settings = icon(SettingsData, 'Settings')
