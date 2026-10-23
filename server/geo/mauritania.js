// التقسيم الإداري لموريتانيا: 15 ولاية و63 مقاطعة.
// المصدر: قائمة المقاطعات (Departments of Mauritania, Wikipedia، محدثة 2023) ومرسوم 8 سبتمبر 2021
// بترقية: تيكان، لكصيبة، عدل بكرو، اطويل، ومبو، مال إلى مقاطعات.
// يجب مطابقتها مع المكتب الوطني للإحصاء / وزارة الداخلية قبل اعتمادها رسمياً، ويمكن تعديلها من الإعدادات.
// الأحياء لا تُزرع هنا عمداً: لا نخمّن تبعية حي لمقاطعة.

export const GEO_SOURCE = 'Wikipedia: Departments of Mauritania (2023) + مرسوم 2021-09-08 (6 مقاطعات جديدة)';

export const WILAYAS = [
  { code: 'NKW', name_ar: 'نواكشوط الغربية', name_fr: 'Nouakchott-Ouest', aliases: ['نواكشوط الغربيه', 'Nouakchott Ouest', 'NKC Ouest'], lat: 18.105, lng: -15.99, m: [
    ['TVZ', 'تفرغ زينة', 'Tevragh Zeina', ['تفرغ زينه', 'تفرغزينة', 'تفرغزينه', 'تفرغ', 'Tevragh-Zeina', 'Tevragh Zeïna', 'TZ', 'تيفرغ زينة'], 18.1046, -15.9885],
    ['KSR', 'لكصر', 'Ksar', ['الكصر', 'لكصار', 'Ksar', 'El Ksar', 'القصر'], 18.1063, -15.9564],
    ['SBK', 'السبخة', 'Sebkha', ['سبخة', 'السبخه', 'Sebkha', 'Sebkhaa'], 18.0752, -15.9925],
  ] },
  { code: 'NKN', name_ar: 'نواكشوط الشمالية', name_fr: 'Nouakchott-Nord', aliases: ['نواكشوط الشماليه', 'Nouakchott Nord'], lat: 18.13, lng: -15.92, m: [
    ['DNM', 'دار النعيم', 'Dar Naïm', ['دار النعيم', 'دارالنعيم', 'Dar Naim', 'Dar Naïm', 'Dar-Naim'], 18.1169, -15.9252],
    ['TYR', 'تيارت', 'Teyarett', ['تيارات', 'Teyarett', 'Teyaret', 'Tiyaret'], 18.1408, -15.9462],
    ['TJN', 'توجنين', 'Toujounine', ['توجونين', 'Toujounine', 'Toujounin'], 18.0789, -15.9028],
  ] },
  { code: 'NKS', name_ar: 'نواكشوط الجنوبية', name_fr: 'Nouakchott-Sud', aliases: ['نواكشوط الجنوبيه', 'Nouakchott Sud'], lat: 18.04, lng: -15.95, m: [
    ['ARF', 'عرفات', 'Arafat', ['Arafat', 'عرفاة'], 18.0464, -15.9615],
    ['MNA', 'الميناء', 'El Mina', ['الميناء', 'المينا', 'ميناء', 'El Mina', 'Mina'], 18.0438, -15.9903],
    ['RYD', 'الرياض', 'Riyad', ['رياض', 'Riyad', 'Riad', 'Riadh'], 18.0093, -15.9476],
  ] },
  { code: 'TRZ', name_ar: 'اترارزة', name_fr: 'Trarza', aliases: ['الترارزة', 'ترارزة', 'اترارزه'], lat: 17.0, lng: -15.4, m: [
    ['RSO', 'روصو', 'Rosso', ['لكوارب', 'Rosso'], 16.5138, -15.805],
    ['BTL', 'بوتلميت', 'Boutilimit', ['بوتيلميت', 'Boutilimit'], 17.55, -14.7],
    ['KMC', 'كرمسين', 'Keur Macène', ['Keur Massene', 'Keur Macene'], 16.55, -16.23],
    ['MDR', 'المذرذرة', 'Méderdra', ['المذرذره', 'Mederdra'], 16.92, -15.67],
    ['OUN', 'واد الناقة', 'Ouad Naga', ['واد الناقه', 'Ouad Naga', 'Wad Naga'], 17.97, -15.52],
    ['RKZ', 'اركيز', 'R\'Kiz', ['ركيز', 'Rkiz', 'R Kiz'], 16.95, -15.23],
    ['TKN', 'تيكان', 'Tékane', ['تكان', 'Tekane', 'N\'Tekane'], 16.6, -15.35],
  ] },
  { code: 'DKN', name_ar: 'داخلت انواذيبو', name_fr: 'Dakhlet Nouadhibou', aliases: ['انواذيبو', 'نواذيبو', 'Nouadhibou'], lat: 20.94, lng: -17.04, m: [
    ['NDB', 'انواذيبو', 'Nouadhibou', ['نواذيبو', 'Nouadhibou', 'NDB'], 20.9425, -17.0362],
    ['CHM', 'الشامي', 'Chami', ['شامي', 'Chami', 'Chamy'], 20.06, -15.98],
  ] },
  { code: 'INC', name_ar: 'إينشيري', name_fr: 'Inchiri', aliases: ['انشيري', 'اينشيري', 'Inchiri'], lat: 19.75, lng: -14.38, m: [
    ['AKJ', 'أكجوجت', 'Akjoujt', ['اكجوجت', 'Akjoujt'], 19.7469, -14.3857],
    ['BNC', 'بنشاب', 'Bénichab', ['Benichab'], 19.43, -15.4],
  ] },
  { code: 'ADR', name_ar: 'آدرار', name_fr: 'Adrar', aliases: ['ادرار', 'أدرار', 'Adrar'], lat: 20.5, lng: -11.5, m: [
    ['ATR', 'أطار', 'Atar', ['اطار', 'Atar'], 20.5169, -13.0499],
    ['AJF', 'أوجفت', 'Aoujeft', ['اوجفت', 'Aoujeft', 'Aoujeft'], 20.03, -13.05],
    ['CHG', 'شنقيط', 'Chinguetti', ['Chinguetti', 'Chinguitti'], 20.46, -12.36],
    ['OUD', 'وادان', 'Ouadane', ['Ouadane', 'Wadane'], 20.93, -11.62],
  ] },
  { code: 'TRS', name_ar: 'تيرس زمور', name_fr: 'Tiris Zemmour', aliases: ['تيرس الزمور', 'Tiris Zemmour'], lat: 24.0, lng: -9.5, m: [
    ['ZRT', 'ازويرات', 'Zouérate', ['الزويرات', 'زويرات', 'Zouerat', 'Zouerate'], 22.735, -12.471],
    ['FDR', 'افديرك', 'F\'Déirick', ['فديرك', 'Fderik', 'Fdérik'], 22.68, -12.71],
    ['BMG', 'بير أم اكرين', 'Bir Moghrein', ['بير ام اكرين', 'بير أم كرين', 'Bir Mogrein'], 25.23, -11.58],
  ] },
  { code: 'TAG', name_ar: 'تكانت', name_fr: 'Tagant', aliases: ['تگانت', 'Tagant'], lat: 18.5, lng: -11.0, m: [
    ['TJK', 'تجكجة', 'Tidjikja', ['تجكجه', 'Tidjikja'], 18.556, -11.427],
    ['MDJ', 'المجرية', 'Moudjéria', ['المجريه', 'Moudjeria'], 17.88, -12.33],
    ['TCH', 'تيشيت', 'Tichitt', ['Tichit', 'Tichitt'], 18.45, -9.51],
  ] },
  { code: 'BRK', name_ar: 'لبراكنة', name_fr: 'Brakna', aliases: ['البراكنة', 'براكنة', 'Brakna'], lat: 17.2, lng: -13.5, m: [
    ['ALG', 'ألاك', 'Aleg', ['الاك', 'ألاگ', 'Aleg'], 17.053, -13.917],
    ['BBB', 'بابابي', 'Bababé', ['Bababe'], 16.33, -13.95],
    ['BOG', 'بوكي', 'Bogué', ['بوگي', 'Boghe', 'Bogue'], 16.59, -14.27],
    ['MBG', 'امباني', 'M\'Bagne', ['Mbagne'], 16.15, -13.78],
    ['MGL', 'مكطع لحجار', 'Magta Lahjar', ['مگطع لحجار', 'مقطع لحجار', 'Magta Lahjar'], 17.5, -13.08],
    ['MAL', 'مال', 'Male', ['Maal', 'Mal'], 17.3, -13.2],
  ] },
  { code: 'GRG', name_ar: 'كوركول', name_fr: 'Gorgol', aliases: ['گورگول', 'غورغول', 'Gorgol'], lat: 16.0, lng: -12.8, m: [
    ['KAE', 'كيهيدي', 'Kaédi', ['Kaedi'], 16.15, -13.5],
    ['LXB', 'لكصيبة', 'Lexeiba', ['لكصيبه', 'Lexeiba', 'Lexeïba'], 16.25, -13.15],
    ['MBT', 'امبود', 'M\'Bout', ['Mbout'], 16.02, -12.58],
    ['MGH', 'مقامة', 'Maghama', ['مقامه', 'Maghama'], 15.52, -12.85],
    ['MNG', 'مونكل', 'Monguel', ['مونگل', 'Monguel'], 16.42, -13.13],
  ] },
  { code: 'ASB', name_ar: 'لعصابة', name_fr: 'Assaba', aliases: ['العصابة', 'عصابة', 'Assaba'], lat: 16.7, lng: -11.5, m: [
    ['KIF', 'كيفة', 'Kiffa', ['كيفه', 'Kiffa'], 16.62, -11.4],
    ['BKL', 'باركيول', 'Barkéol', ['Barkeol', 'Barkewol'], 16.65, -12.5],
    ['BMD', 'بومديد', 'Boumdeid', ['Boumdeid'], 17.43, -11.33],
    ['GRU', 'كرو', 'Guerou', ['گرو', 'Guerou'], 16.81, -11.83],
    ['KNK', 'كنكوصة', 'Kankossa', ['كنكوصه', 'Kankossa'], 15.93, -11.52],
  ] },
  { code: 'GDM', name_ar: 'كيدي ماغا', name_fr: 'Guidimakha', aliases: ['گيدي ماغا', 'غيدي ماغا', 'Guidimakha', 'Guidimagha'], lat: 15.3, lng: -12.0, m: [
    ['SLB', 'سيلبابي', 'Sélibaby', ['Selibaby', 'Sélibabi'], 15.16, -12.18],
    ['OYG', 'ولد ينج', 'Ould Yengé', ['Ould Yenge'], 15.53, -11.72],
    ['GHB', 'غابو', 'Ghabou', ['Ghabou'], 15.2, -12.5],
    ['WMP', 'ومبو', 'Wompou', ['Woumpou', 'Wompou'], 15.3, -12.35],
  ] },
  { code: 'HGH', name_ar: 'الحوض الغربي', name_fr: 'Hodh El Gharbi', aliases: ['الحوض الغربى', 'Hodh Gharbi', 'Hodh El Gharbi'], lat: 16.5, lng: -9.5, m: [
    ['AIN', 'العيون', 'Aïoun', ['لعيون', 'Aioun', 'Ayoun El Atrous'], 16.66, -9.61],
    ['KBN', 'كوبني', 'Koubenni', ['Kobenni', 'Koubenni'], 15.86, -9.41],
    ['TMC', 'تامشكط', 'Tamchekett', ['تامشكت', 'Tamchakett'], 17.24, -10.67],
    ['TNT', 'الطينطان', 'Tintane', ['الطينطانه', 'Tintane'], 16.4, -10.17],
    ['TWL', 'اطويل', 'Touil', ['طويل', 'Touil'], 16.5, -9.0],
  ] },
  { code: 'HCH', name_ar: 'الحوض الشرقي', name_fr: 'Hodh Ech Chargui', aliases: ['الحوض الشرقى', 'Hodh Chargui', 'Hodh Ech Chargui'], lat: 18.0, lng: -7.0, m: [
    ['NEM', 'النعمة', 'Néma', ['النعمه', 'Nema'], 16.6167, -7.25],
    ['ADB', 'عدل بكرو', 'Adel Bagrou', ['عدل بگرو', 'Adel Begrou'], 15.55, -7.07],
    ['AMJ', 'آمرج', 'Amourj', ['امرج', 'Amourj'], 16.07, -7.2],
    ['BSK', 'باسكنو', 'Bassiknou', ['Bassikounou'], 15.87, -5.95],
    ['DJG', 'جكني', 'Djigueni', ['جگني', 'Djiguenni'], 15.73, -8.67],
    ['NBL', 'انبيكت لحواش', 'N\'Beiket Lehwach', ['انبيكة لحواش', 'Nbeiket Lahwach'], 17.08, -5.73],
    ['OUL', 'ولاتة', 'Oualata', ['ولاته', 'Walata'], 17.3, -7.03],
    ['TMB', 'تمبدغة', 'Timbédra', ['تمبدغه', 'Timbedra'], 16.24, -8.17],
  ] },
];
