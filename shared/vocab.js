// المصطلحات المعروضة في الواجهة، بلغة السوق الموريتاني.

export const DEALS = { sale: 'بيع', rent: 'إيجار' };
export const DEALS_PUBLIC = { sale: 'للبيع', rent: 'للإيجار' };

export const TYPES = {
  land: 'قطعة أرض',
  house: 'دار',
  apartment: 'شقة',
  villa: 'فيلا',
  building: 'عمارة',
  shop: 'بوتيك / محل',
  office: 'مكتب',
  warehouse: 'مخزن / مستودع',
  farm: 'مزرعة / أرض زراعية',
  other: 'أخرى',
};

// كلمات السوق التي تدل على كل نوع (بعد التطبيع)
export const TYPE_WORDS = {
  land: ['قطعه', 'قطع', 'ارض', 'اراضي', 'نمره', 'نمر', 'قطعه ارضيه', 'terrain', 'parcelle', 'lot'],
  house: ['دار', 'الدار', 'ديار', 'الديار', 'منزل', 'بيت', 'maison', 'كزره مبنيه'],
  apartment: ['شقه', 'شقق', 'appartement', 'appart', 'studio', 'ستوديو'],
  villa: ['فيلا', 'فيلات', 'villa'],
  building: ['عماره', 'عمارات', 'immeuble', 'بنايه'],
  shop: ['بوتيك', 'بوتيكات', 'boutique', 'محل', 'محلات', 'دكان', 'magasin'],
  office: ['مكتب', 'مكاتب', 'bureau'],
  warehouse: ['مخزن', 'مخازن', 'مستودع', 'hangar', 'depot', 'دبو'],
  farm: ['مزرعه', 'مزارع', 'ferme', 'حديقه زراعيه'],
};

export const AVAILABILITY = {
  available: 'متوفر', reserved: 'محجوز', sold: 'بيع', rented: 'مؤجر', withdrawn: 'سُحب من السوق', unknown: 'غير مؤكد',
};

export const REQUEST_STATUS = { new: 'جديد', active: 'قيد المتابعة', paused: 'متوقف مؤقتاً', won: 'تم', lost: 'لم يتم' };
export const DEAL_STAGES = {
  interest: 'اهتمام', contacted: 'تواصل', viewing: 'معاينة', negotiation: 'تفاوض', won: 'تمت', lost: 'توقفت',
};
export const ROLES = { buyer: 'مشترٍ', seller: 'بائع', tenant: 'مستأجر', landlord: 'مؤجر', owner: 'مالك', broker: 'وسيط' };
export const PRIORITY = { low: 'عادية منخفضة', normal: 'عادية', high: 'مهمة' };
export const ACTIVITY_KINDS = { call: 'اتصال', whatsapp: 'واتساب', meeting: 'لقاء', visit: 'معاينة', note: 'ملاحظة', sms: 'رسالة', other: 'أخرى' };
export const APPT_KINDS = { viewing: 'معاينة', meeting: 'لقاء', signing: 'توقيع', other: 'موعد' };
export const APPT_STATUS = { planned: 'مقرر', done: 'تم', cancelled: 'أُلغي', no_show: 'لم يحضر', postponed: 'تأجل' };
export const SENT_RESPONSE = { pending: 'لم يرد بعد', interested: 'مهتم', not_interested: 'غير مهتم', visited: 'عاين', dismissed: 'استُبعد' };
export const INBOX_KINDS = { search: 'أبحث عن عقار', offer: 'اعرض عقارك', interest: 'اهتمام بعقار', contact: 'استفسار', message: 'رسالة' };
export const INBOX_SOURCES = { site: 'الموقع', whatsapp: 'واتساب', import: 'استيراد', capture: 'التقاط' };

export const FEATURES = {
  corner: 'ركن (زاوية)', paved: 'على شارع مسفلت', water: 'ماء', electricity: 'كهرباء', fence: 'مسوّرة', title: 'سند ملكية متوفر',
  furnished: 'مفروشة', garage: 'مرآب', ac: 'مكيفات', yard: 'فناء', floor_ground: 'طابق أرضي', sea_view: 'قريب من البحر',
};

export const TZ = 'Africa/Nouakchott';
