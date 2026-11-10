import { Placeholder } from "./placeholder";

// KVKK m.10 aydınlatma metni — TASLAK. Hukuki inceleme gerekir.
export function PrivacyTr() {
  return (
    <>
      <h2>1. Veri sorumlusu</h2>
      <p>
        Kişisel verileriniz, 6698 sayılı Kişisel Verilerin Korunması Kanunu (&quot;KVKK&quot;) kapsamında veri sorumlusu
        sıfatıyla <Placeholder>VERİ SORUMLUSUNUN ADI / UNVANI</Placeholder> (&quot;Ride &amp; Vibe&quot;) tarafından
        aşağıda açıklanan şekilde işlenir. İletişim: <Placeholder>İLETİŞİM E-POSTASI</Placeholder>.
      </p>

      <h2>2. Hangi verileri işliyoruz?</h2>
      <ul>
        <li><strong>Kimlik ve iletişim:</strong> ad soyad, telefon numarası, e-posta adresi, doğum tarihi, şehir ve ilçe, (isteğe bağlı) Instagram kullanıcı adı.</li>
        <li><strong>Sürüş bilgileri:</strong> ehliyet sınıfı, sürüş deneyimi, motosiklet bilgileri, sürüş tarzı, diğer kulüp üyelikleri.</li>
        <li><strong>Başvuru yanıtları:</strong> ilgilendiğiniz etkinlikler, beklentileriniz ve açık uçlu sorulara verdiğiniz cevaplar.</li>
        <li><strong>Hesap bilgileri:</strong> Google ile giriş yaptığınızda Google hesabınızdaki ad, e-posta adresi ve profil fotoğrafı.</li>
        <li><strong>Reklam kaynağı:</strong> başvuru sayfasına bir reklam bağlantısıyla geldiyseniz bağlantıdaki kampanya bilgisi (ör. hangi Instagram reklamı).</li>
        <li><strong>Görsel veriler:</strong> yalnızca açık rıza vermeniz halinde, etkinliklerde çekilen ve sizi gösteren fotoğraflar.</li>
        <li><strong>Teknik veriler:</strong> giriş yapabilmeniz için zorunlu oturum çerezi.</li>
      </ul>

      <h2>3. Hangi amaçlarla işliyoruz?</h2>
      <ul>
        <li>Üyelik başvurunuzu değerlendirmek ve sizinle (WhatsApp, telefon veya e-posta ile) iletişime geçmek,</li>
        <li>Üyeliğinizi yönetmek, etkinlik ve sürüşleri planlamak, katılımı ve grup sürüşü güvenliğini sağlamak,</li>
        <li>18 yaş şartını kontrol etmek ve doğum gününüzü kutlamak,</li>
        <li>Hangi tanıtım kanallarının ve reklamların işe yaradığını ölçmek,</li>
        <li>Açık rızanız varsa, etkinlik fotoğraflarını kulüp galerisinde paylaşmak.</li>
      </ul>

      <h2>4. Hukuki sebepler</h2>
      <ul>
        <li>Üyelik ilişkisinin kurulması ve yürütülmesi için gerekli olması (KVKK m.5/2-c),</li>
        <li>Temel hak ve özgürlüklerinize zarar vermemek kaydıyla kulübün meşru menfaati (KVKK m.5/2-f): kulüp yönetimi, etkinlik güvenliği, tanıtım kanallarının ölçümü,</li>
        <li>Fotoğraflarınızın galeride paylaşılması için açık rızanız (KVKK m.5/1). Bu rızayı istediğiniz zaman hesap sayfanızdan verebilir veya geri alabilirsiniz; geri almak üyeliğinizi etkilemez.</li>
      </ul>

      <h2>5. Verileri kimlerle paylaşıyoruz? Yurt dışına aktarım</h2>
      <p>
        Verileriniz satılmaz ve reklam amacıyla üçüncü kişilerle paylaşılmaz.
      </p>
      <p>
        Kulüp içinde: aktif üyeler, üye rehberinde adınızı, profil fotoğrafınızı, ilçenizi/yakanızı ve
        motosikletlerinizi görebilir. Doğum gününüz (yalnızca gün ve ay) ve Instagram kullanıcı adınız yalnızca
        profilinizde açarsanız gösterilir.
      </p>
      <p>
        Hizmeti sunabilmek için aşağıdaki hizmet sağlayıcılarını (veri işleyen) kullanıyoruz:
      </p>
      <ul>
        <li><strong>Supabase</strong> — veritabanı ve kimlik doğrulama; veriler Avrupa Birliği&apos;nde (Frankfurt, Almanya) saklanır.</li>
        <li><strong>Vercel</strong> — web sitesinin barındırılması; sunucu işlemleri Frankfurt&apos;ta yapılır.</li>
        <li><strong>Google</strong> — &quot;Google ile giriş&quot; hizmeti.</li>
      </ul>
      <p>
        Bu sağlayıcılar Türkiye dışında bulunduğundan, aktarım KVKK m.9 kapsamında Kurul tarafından ilan edilen
        standart sözleşmeler esas alınarak yapılır. <Placeholder>STANDART SÖZLEŞME VE KURUL BİLDİRİMİ DURUMU</Placeholder>
      </p>

      <h2>6. Ne kadar süre saklıyoruz?</h2>
      <ul>
        <li>Reddedilen başvurular: karardan itibaren <Placeholder>6 AY</Placeholder> sonra silinir.</li>
        <li>Üye bilgileri: üyelik süresince ve üyelik sona erdikten sonra <Placeholder>1 YIL</Placeholder> boyunca saklanır, ardından silinir veya anonim hale getirilir.</li>
        <li>Fotoğraflar: açık rızanızı geri aldığınızda galeriden kaldırılır.</li>
      </ul>

      <h2>7. Verileri nasıl topluyoruz?</h2>
      <p>
        Verileriniz; başvuru formu, Google ile giriş ve sitemizi kullanımınız sırasında (oturum çerezi) elektronik
        ortamda, otomatik veya kısmen otomatik yollarla toplanır.
      </p>

      <h2>8. Haklarınız (KVKK m.11)</h2>
      <p>Kulübe başvurarak;</p>
      <ul>
        <li>kişisel verilerinizin işlenip işlenmediğini öğrenme ve işlenmişse bilgi talep etme,</li>
        <li>işlenme amacını ve amacına uygun kullanılıp kullanılmadığını öğrenme,</li>
        <li>yurt içinde veya yurt dışında aktarıldığı üçüncü kişileri bilme,</li>
        <li>eksik veya yanlış işlenmişse düzeltilmesini isteme,</li>
        <li>KVKK m.7&apos;deki şartlar çerçevesinde silinmesini veya yok edilmesini isteme,</li>
        <li>düzeltme ve silme işlemlerinin aktarıldığı üçüncü kişilere bildirilmesini isteme,</li>
        <li>münhasıran otomatik sistemlerle analiz edilmesi sonucu aleyhinize bir sonuç çıkmasına itiraz etme,</li>
        <li>kanuna aykırı işlenmesi sebebiyle zarara uğramanız halinde zararın giderilmesini talep etme</li>
      </ul>
      <p>haklarına sahipsiniz.</p>

      <h2>9. Başvuru yöntemi</h2>
      <p>
        Taleplerinizi <Placeholder>İLETİŞİM E-POSTASI</Placeholder> adresine iletebilirsiniz. Talepleriniz en geç 30 gün
        içinde ücretsiz olarak sonuçlandırılır.
      </p>
    </>
  );
}
