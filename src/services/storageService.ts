import { Source, Topic, Question, UserProgress, QuizSessionResult } from '../types';

const SOURCES_KEY = 'menba_sources_v1';
const QUESTIONS_KEY = 'menba_questions_v1';
const TOPICS_KEY = 'menba_topics_v1';
const PROGRESS_KEY = 'menba_progress_v1';
const SESSIONS_KEY = 'menba_sessions_v1';

const DEFAULT_DEMO_SOURCES: Source[] = [
  {
    id: 'demo-source-1',
    title: 'Anayasa Hukuku - Temel Haklar ve Özgürlükler',
    description: 'Anayasa hukuku ders özeti ve insan hakları temel ilkeleri kılavuzu.',
    content: `Anayasa Hukuku ve Temel Haklar

1. Temel Hak ve Hürriyetlerin Niteliği
Temel hak ve hürriyetler, kişinin kişiliğine bağlı, dokunulmaz, devredilemez ve vazgeçilemez haklardır. Anayasa'nın 13. maddesine göre temel hak ve hürriyetler, özlerine dokunulmaksızın yalnızca Anayasanın ilgili maddelerinde belirtilen sebeplere bağlı olarak ve ancak kanunla sınırlanabilir. Bu sınırlama, Anayasanın sözüne ve ruhuna, demokratik toplum düzeninin ve lâik Cumhuriyetin gereklerine ve ölçülülük ilkesine aykırı olamaz.

2. Mülkiyet Hakkı ve Çalışma Hürriyeti
Herkes, mülkiyet ve miras haklarına sahiptir. Bu haklar, ancak kamu yararı amacıyla, kanunla sınırlanabilir. Mülkiyet hakkının kullanılması toplum yararına aykırı olamaz.
Çalışma, herkesin hakkı ve ödevidir. Devlet, çalışanların hayat seviyesini yükseltmek, çalışma hayatını geliştirmek için çalışanları ve işsizleri korumak, çalışmayı desteklemek, işsizliği önlemeye elverişli ekonomik bir ortam yaratmak ve çalışma barışını sağlamak için gerekli tedbirleri alır.

3. Yargı Yolu ve Hak Arama Hürriyeti
Herkes, meşrû vasıta ve yollardan faydalanmak suretiyle yargı mercileri önünde davacı veya davalı olarak iddia ve savunma ile adil yargılanma hakkına sahiptir. Hiçbir mahkeme, görev ve yetkisi içindeki davaya bakmaktan kaçınamaz.`,
    file_type: 'text',
    created_at: new Date(Date.now() - 86400000 * 3).toISOString(),
    topics_count: 3,
    questions_count: 6,
  },
  {
    id: 'demo-source-2',
    title: 'Yazılım Mimarisi - Mikroservisler ve REST API',
    description: 'Modern web ve bulut sistemlerinde mikroservis desenleri ve REST mimarisi.',
    content: `Mikroservis Mimarisi ve RESTful Web Servisleri

1. Mikroservis Prensipleri
Mikroservis mimarisi, büyük ve karmaşık bir yazılım uygulamasını bağımsız olarak dağıtılabilir, gevşek bağlı (loosely coupled) ve tek bir iş sorumluluğuna odaklanmış küçük servisler halinde yapılandıran bir yaklaşımdır. Her servis kendi veritabanına sahip olabilir ve ağ üzerinden HTTP/REST veya gRPC ile haberleşir.

2. REST API Tasarım İlkeleri
REST (Representational State Transfer), web servisleri tasarlamak için kullanılan mimari bir stildir. Stateless (durumsuz) iletişim, standart HTTP metotları (GET, POST, PUT, DELETE) ve kaynak odaklı URI yapısı temel prensipleridir.
- GET: Kaynağı okumak için kullanılır, idempotenttir.
- POST: Yeni kaynak oluşturur.
- PUT: Kaynağı tamamen günceller.
- DELETE: Kaynağı siler.

3. Veri Tutarlılığı ve Saga Deseni
Mikroservislerde dağıtık veritabanları nedeniyle ACID işlemler tek noktadan yürütülemez. Bunun yerine Eventual Consistency (Nihai Tutarlılık) ilkeleri ve Saga Pattern kullanılır.`,
    file_type: 'pdf',
    created_at: new Date(Date.now() - 86400000 * 1).toISOString(),
    topics_count: 3,
    questions_count: 6,
  }
];

const DEFAULT_DEMO_TOPICS: Topic[] = [
  { id: 'top-1', source_id: 'demo-source-1', name: 'Temel Hak ve Hürriyetler', description: 'Dokunulmaz ve devredilemez hakların kanuni sınırları', importance: 5, mastery_level: 80 },
  { id: 'top-2', source_id: 'demo-source-1', name: 'Mülkiyet Hakkı & Çalışma', description: 'Kamu yararı ve mülkiyet sınırlandırması', importance: 4, mastery_level: 65 },
  { id: 'top-3', source_id: 'demo-source-1', name: 'Hak Arama & Adil Yargılanma', description: 'Mahkeme erişimi ve savunma hakkı', importance: 5, mastery_level: 90 },
  { id: 'top-4', source_id: 'demo-source-2', name: 'Mikroservis Prensipleri', description: 'Gevşek bağlı servisler ve bağımsız dağıtım', importance: 5, mastery_level: 70 },
  { id: 'top-5', source_id: 'demo-source-2', name: 'REST API Tasarımı', description: 'HTTP metodları, durumsuz iletişim ve kaynaklar', importance: 4, mastery_level: 85 },
  { id: 'top-6', source_id: 'demo-source-2', name: 'Dağıtık Veri & Saga Deseni', description: 'Eventual consistency ve işlem yönetimi', importance: 3, mastery_level: 50 },
];

const DEFAULT_DEMO_QUESTIONS: Question[] = [
  {
    id: 'q-1',
    source_id: 'demo-source-1',
    topic_id: 'top-1',
    topic_name: 'Temel Hak ve Hürriyetler',
    question_text: "Anayasa'nın 13. maddesine göre temel hak ve hürriyetlerin sınırlandırılmasında aşağıdakilerden hangisi şart koşulmamıştır?",
    options: [
      "Sınırlamanın ancak kanunla yapılması",
      "Hakkın özüne dokunulmaması",
      "Cumhurbaşkanlığı kararnamesiyle keyfi durdurulabilmesi",
      "Ölçülülük ilkesine uygun olması"
    ],
    correct_option_index: 2,
    explanation: "Temel hak ve hürriyetler ancak KANUNLA sınırlanabilir. Cumhurbaşkanlığı kararnamesiyle keyfi durdurulması anayasal ilkelere aykırıdır.",
    difficulty: 'medium',
  },
  {
    id: 'q-2',
    source_id: 'demo-source-1',
    topic_id: 'top-1',
    topic_name: 'Temel Hak ve Hürriyetler',
    question_text: "Temel hak ve hürriyetlerin niteliği ile ilgili aşağıdakilerden hangisi DOĞRUDUR?",
    options: [
      "Kişinin kişiliğine bağlı, dokunulmaz ve devredilemez haklardır",
      "Sadece sözleşmeyle başkasına devredilebilir",
      "Devlet tarafından tamamen ortadan kaldırılabilir",
      "Yalnızca belirli yaş grubundaki vatandaşlara tanınır"
    ],
    correct_option_index: 0,
    explanation: "Temel haklar kişinin doğuştan sahip olduğu, dokunulmaz ve devredilemez haklardır.",
    difficulty: 'easy',
  },
  {
    id: 'q-3',
    source_id: 'demo-source-1',
    topic_id: 'top-2',
    topic_name: 'Mülkiyet Hakkı & Çalışma',
    question_text: "Mülkiyet hakkı hangi temel gerekçe ile sınırlanabilir?",
    options: [
      "Kişisel isteklere göre",
      "Ancak kamu yararı amacıyla ve kanunla",
      "Sadece ticari şirket kararlarıyla",
      "Hiçbir şekilde sınırlanamaz"
    ],
    correct_option_index: 1,
    explanation: "Mülkiyet hakkı ancak kamu yararı gözetilerek ve kanun yoluyla sınırlandırılabilir.",
    difficulty: 'medium',
  },
  {
    id: 'q-4',
    source_id: 'demo-source-2',
    topic_id: 'top-4',
    topic_name: 'Mikroservis Prensipleri',
    question_text: "Mikroservis mimarisinin temel özellikleri arasında aşağıdakilerden hangisi yer almaz?",
    options: [
      "Servislerin bağımsız olarak yayına alınabilmesi",
      "Servislerin tek bir devasa ortak veritabanına zorunlu bağımlı olması",
      "Gevşek bağlılık (loose coupling) ilkesi",
      "Servislerin HTTP veya gRPC ile haberleşmesi"
    ],
    correct_option_index: 1,
    explanation: "Mikroservislerde her servisin kendi veritabanına sahip olması (Database per service) önerilir, ortak monolitik veritabanı bağımlılığı kaçınılması gereken bir durumdur.",
    difficulty: 'hard',
  },
  {
    id: 'q-5',
    source_id: 'demo-source-2',
    topic_id: 'top-5',
    topic_name: 'REST API Tasarımı',
    question_text: "REST mimarisinde mevcut bir kaynağı tamamen güncellemek için hangi HTTP metodu kullanılır?",
    options: ["GET", "POST", "PUT", "DELETE"],
    correct_option_index: 2,
    explanation: "PUT metodu bir kaynağın tamamını güncellemek veya değiştirmek için kullanılır.",
    difficulty: 'easy',
  }
];

export const storageService = {
  getSources(): Source[] {
    const raw = localStorage.getItem(SOURCES_KEY);
    if (!raw) {
      localStorage.setItem(SOURCES_KEY, JSON.stringify(DEFAULT_DEMO_SOURCES));
      return DEFAULT_DEMO_SOURCES;
    }
    try {
      return JSON.parse(raw);
    } catch {
      return DEFAULT_DEMO_SOURCES;
    }
  },

  saveSources(sources: Source[]): void {
    localStorage.setItem(SOURCES_KEY, JSON.stringify(sources));
  },

  addSource(source: Source): void {
    const current = this.getSources();
    this.saveSources([source, ...current]);
  },

  deleteSource(id: string): void {
    const sources = this.getSources().filter((s) => s.id !== id);
    this.saveSources(sources);

    // clean associated topics & questions
    const topics = this.getTopics().filter((t) => t.source_id !== id);
    this.saveTopics(topics);

    const questions = this.getQuestions().filter((q) => q.source_id !== id);
    this.saveQuestions(questions);
  },

  getTopics(): Topic[] {
    const raw = localStorage.getItem(TOPICS_KEY);
    if (!raw) {
      localStorage.setItem(TOPICS_KEY, JSON.stringify(DEFAULT_DEMO_TOPICS));
      return DEFAULT_DEMO_TOPICS;
    }
    try {
      return JSON.parse(raw);
    } catch {
      return DEFAULT_DEMO_TOPICS;
    }
  },

  saveTopics(topics: Topic[]): void {
    localStorage.setItem(TOPICS_KEY, JSON.stringify(topics));
  },

  addTopics(newTopics: Topic[]): void {
    const current = this.getTopics();
    this.saveTopics([...newTopics, ...current]);
  },

  getQuestions(): Question[] {
    const raw = localStorage.getItem(QUESTIONS_KEY);
    if (!raw) {
      localStorage.setItem(QUESTIONS_KEY, JSON.stringify(DEFAULT_DEMO_QUESTIONS));
      return DEFAULT_DEMO_QUESTIONS;
    }
    try {
      return JSON.parse(raw);
    } catch {
      return DEFAULT_DEMO_QUESTIONS;
    }
  },

  saveQuestions(questions: Question[]): void {
    localStorage.setItem(QUESTIONS_KEY, JSON.stringify(questions));
  },

  addQuestions(newQuestions: Question[]): void {
    const current = this.getQuestions();
    this.saveQuestions([...newQuestions, ...current]);
  },

  deleteQuestion(id: string): void {
    const questions = this.getQuestions().filter((q) => q.id !== id);
    this.saveQuestions(questions);
  },

  getSessions(): QuizSessionResult[] {
    const raw = localStorage.getItem(SESSIONS_KEY);
    if (!raw) return [];
    try {
      return JSON.parse(raw);
    } catch {
      return [];
    }
  },

  saveQuizSession(session: QuizSessionResult): void {
    const current = this.getSessions();
    localStorage.setItem(SESSIONS_KEY, JSON.stringify([session, ...current]));

    // Update topic stats based on attempts
    const topics = this.getTopics();
    session.attempts.forEach((att) => {
      if (att.question.topic_name) {
        const matching = topics.find((t) => t.name.toLowerCase() === att.question.topic_name?.toLowerCase());
        if (matching) {
          const prevLevel = matching.mastery_level || 50;
          const delta = att.is_correct ? 8 : -10;
          matching.mastery_level = Math.max(10, Math.min(100, prevLevel + delta));
        }
      }
    });
    this.saveTopics(topics);
  }
};
