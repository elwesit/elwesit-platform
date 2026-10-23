// الإعدادات الافتراضية — كلها قابلة للتعديل من «الإعدادات» في مساحة الإدارة.
// بيانات التواصل فارغة عمداً حتى يُدخلها صاحب الموقع؛ لا نخترع أرقاماً.
export const DEFAULT_SETTINGS = {
  site_name: 'الوسيط العقاري',
  site_tagline: 'عقارات للبيع والإيجار في موريتانيا',
  site_intro: 'تصفح العقارات المعروضة، أو أرسل طلبك وسنتواصل معك.',
  contact_phone: '',
  contact_whatsapp: '',
  contact_email: '',
  office_address: '',
  office_hours: '',
  business_name_legal: '',
  base_url: '',
  // الخرائط: OpenStreetMap افتراضياً مع النسب المطلوب. للاستخدام الكثيف استخدم مزوداً بترخيص مناسب.
  map_tiles_url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  map_tiles_attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">مساهمو OpenStreetMap</a>',
  map_tiles_max_zoom: 19,
  map_center: [18.0858, -15.9785],
  map_zoom: 12,
  approx_radius_m: 600,
  stale_days: 30,
  default_currency_display: 'MRU',
  listing_page_size: 10,
  privacy_extra: '',
  terms_extra: '',
};

export const DEFAULT_TEMPLATES = [
  { kind: 'buyer', title: 'أسئلة للمشتري', body: 'السلام عليكم {name}، معك {site_name}.\nحتى أبحث لك عن المناسب:\n- بيع أم إيجار؟\n- نوع العقار؟\n- المقاطعة أو الحي المفضل؟\n- الميزانية التقريبية (بالأوقية الجديدة أو القديمة)؟\n- المساحة أو عدد الغرف؟' },
  { kind: 'seller', title: 'أسئلة للبائع / المالك', body: 'السلام عليكم {name}، معك {site_name}.\nلتسجيل عقارك أرجو إرسال:\n- النوع والمساحة\n- الموقع (الحي، معلم قريب، أو موقع على الخريطة)\n- السعر المطلوب وهل هو قابل للتفاوض\n- صور إن وجدت\n- هل أنت المالك أم وسيط؟' },
  { kind: 'followup', title: 'متابعة', body: 'السلام عليكم {name}، أتابع معك بخصوص {title}. هل ما زلت مهتماً؟ يسعدني ترتيب معاينة.' },
  { kind: 'property', title: 'تسويق عقار', body: '{deal_label}: {title}\n📍 {place}\n{area}{price}\nالمرجع: {ref}\n{link}' },
  { kind: 'verify', title: 'التحقق من توفر عرض', body: 'السلام عليكم {name}، هل ما زال العقار ({title}) متوفراً؟ وهل السعر ما زال {price}؟' },
];
