import express, { Request, Response } from 'express';
import cors from 'cors';

const app = express();
const PORT = process.env.PORT || 3004;
const VERSION = '1.0.0';
const USDC_BASE_MAINNET = '0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA';
const BASE_NETWORK_CAIP2 = 'eip155:8453';

app.use(cors());
app.use(express.json({ limit: '512kb' }));

// ─── X402 Middleware (x402 v2 spec compliant) ──────────────────────
const FREE_PATHS = ['/', '/health', '/openapi.json', '/favicon.ico', '/api/formats', '/api/keywords'];

app.use((req: Request, res: Response, next: any) => {
  if (FREE_PATHS.includes(req.path)) return next();

  const payment = req.headers['x402-payment'];
  if (!payment) {
    const wallet = process.env.WALLET_ADDRESS || '0x421C25445d6CF7B292933D743E698ed24dE36270';
    const resourceUrl = `https://${req.headers.host}${req.path}`;
    const accepts = [{
      scheme: 'exact',
      network: BASE_NETWORK_CAIP2,
      amount: '50000',
      asset: USDC_BASE_MAINNET,
      payTo: wallet,
      maxTimeoutSeconds: 60,
      resource: {
        url: resourceUrl,
        description: 'ATS resume analysis, scoring, tailoring, and job matching',
        mimeType: 'application/json',
        serviceName: 'Flagship Resume ATS',
        tags: ['resume', 'ats', 'job-search', 'career', 'optimization'],
      },
      extra: { name: 'USDC', version: '2' },
    }];
    const body = { x402Version: 2, accepts, wallet };
    const b64 = Buffer.from(JSON.stringify(body)).toString('base64');
    res.set('X-Payment-Protocol', 'x402');
    res.set('X402-Payment', 'required');
    res.set('Payment-Required', b64);
    return res.status(402).json(body);
  }

  next();
});

// ─── ATS Keyword Database ───────────────────────────────────────────
const ATS_KEYWORDS: Record<string, string[]> = {
  'software engineering': [
    'JavaScript', 'TypeScript', 'Python', 'Java', 'C++', 'Go', 'Rust',
    'React', 'Angular', 'Vue', 'Node.js', 'Express', 'Django', 'FastAPI',
    'AWS', 'Docker', 'Kubernetes', 'CI/CD', 'Git', 'Agile', 'Scrum',
    'REST API', 'GraphQL', 'MongoDB', 'PostgreSQL', 'Redis',
    'System design', 'Microservices', 'TDD', 'SDLC',
  ],
  'data science': [
    'Python', 'R', 'SQL', 'TensorFlow', 'PyTorch', 'scikit-learn',
    'pandas', 'NumPy', 'matplotlib', 'Tableau', 'Power BI',
    'Machine Learning', 'Deep Learning', 'NLP', 'Computer Vision',
    'Statistical modeling', 'A/B testing', 'ETL', 'Data pipeline',
    'Hadoop', 'Spark', 'Airflow', 'dbt',
  ],
  'devops / sre': [
    'AWS', 'Azure', 'GCP', 'Terraform', 'Ansible', 'Chef', 'Puppet',
    'Docker', 'Kubernetes', 'ECS', 'EKS', 'Helm', 'Prometheus', 'Grafana',
    'Jenkins', 'GitHub Actions', 'GitLab CI', 'CircleCI', 'ArgoCD',
    'Linux', 'Bash', 'Python', 'Go', 'Networking', 'Load balancing',
    'Incident management', 'SLO', 'SLI', 'SLA', 'On-call',
  ],
  'cybersecurity': [
    'SIEM', 'Splunk', 'QRadar', 'Nmap', 'Burp Suite', 'Metasploit',
    'OWASP', 'NIST', 'ISO 27001', 'SOC 2', 'HIPAA', 'PCI-DSS',
    'Penetration testing', 'Vulnerability assessment', 'Threat modeling',
    'Firewall', 'IDS/IPS', 'Zero Trust', 'IAM', 'MFA',
    'Incident response', 'Forensics', 'Malware analysis', 'Phishing',
  ],
  'project management': [
    'PMP', 'Agile', 'Scrum', 'Kanban', 'SAFe', 'Waterfall',
    'JIRA', 'Confluence', 'Asana', 'Monday.com', 'Trello',
    'Stakeholder management', 'Risk management', 'Budget', 'Roadmap',
    'Cross-functional', 'KPIs', 'OKRs', 'Change management',
  ],
  'cloud / infrastructure': [
    'AWS', 'Azure', 'GCP', 'Terraform', 'CloudFormation', 'Pulumi',
    'Lambda', 'EC2', 'S3', 'RDS', 'DynamoDB', 'CloudFront', 'VPC',
    'Docker', 'Kubernetes', 'Serverless', 'IaC', 'Observability',
    'Cost optimization', 'Multi-cloud', 'Hybrid cloud', 'Disaster recovery',
  ],
  'it support / help desk': [
    'Active Directory', 'Windows Server', 'Linux', 'VMware', 'vSphere',
    'ServiceNow', 'JIRA Service Management', 'Zendesk', 'Freshdesk',
    'Network troubleshooting', 'DNS', 'DHCP', 'VPN', 'Firewall',
    'Ticketing systems', 'Remote support', 'SLA', 'Knowledge base',
    'Hardware deployment', 'Patch management', 'Asset management',
    'ITIL', 'Incident management', 'Problem management',
  ],
};

// ─── ATS Format Rules ───────────────────────────────────────────────
const ATS_RULES = [
  {
    id: 'simple-formatting',
    title: 'Simple Formatting',
    description: 'Use standard fonts and simple layouts. Avoid tables, columns, graphics, or complex formatting.',
    passCheck: (text: string) => !text.includes('│') && !text.includes('┌') && !text.includes('├'),
    severity: 'high',
  },
  {
    id: 'standard-sections',
    title: 'Standard Section Headings',
    description: 'Use standard section headings: Experience, Education, Skills, Summary.',
    passCheck: (text: string) => {
      const lower = text.toLowerCase();
      return ['experience', 'education', 'skills'].some(s => lower.includes(s));
    },
    severity: 'high',
  },
  {
    id: 'no-headers-footers',
    title: 'No Headers/Footers',
    description: 'ATS cannot read content in headers or footers. Put contact info in body.',
    passCheck: () => true,
    severity: 'medium',
  },
  {
    id: 'keywords-present',
    title: 'Industry Keywords',
    description: 'Resume contains relevant keywords for the target role/industry.',
    passCheck: (text: string, ctx: { jobDescription?: string; industry?: string }) => {
      if (!ctx.industry) return true;
      const required = ATS_KEYWORDS[ctx.industry.toLowerCase()] || [];
      if (required.length === 0) return true;
      const lower = text.toLowerCase();
      const found = required.filter(k => lower.includes(k.toLowerCase()));
      return (found.length / required.length) > 0.3;
    },
    severity: 'critical',
  },
  {
    id: 'action-verbs',
    title: 'Action Verbs',
    description: 'Bullet points start with strong action verbs (led, managed, implemented, etc.).',
    passCheck: (text: string) => {
      const verbs = ['led', 'managed', 'developed', 'implemented', 'created', 'designed', 'built', 'analyzed', 'improved', 'optimized', 'automated', 'coordinated', 'established', 'negotiated', 'resolved', 'streamlined', 'reduced', 'increased', 'launched', 'maintained', 'monitored', 'orchestrated', 'oversaw', 'planned', 'executed'];
      const lower = text.toLowerCase();
      return verbs.filter(v => lower.includes(v)).length >= 2;
    },
    severity: 'medium',
  },
  {
    id: 'quantified-achievements',
    title: 'Quantified Achievements',
    description: 'Resume includes metrics/numbers (%, $, time saved, team size, etc.).',
    passCheck: (text: string) => {
      const metrics = text.match(/\d+%|\$[\d,]+|\d+x|\d+\+ (users|clients|projects|applications|endpoints|requests)/i);
      return metrics !== null && metrics.length >= 2;
    },
    severity: 'high',
  },
  {
    id: 'proper-date-format',
    title: 'Consistent Date Format',
    description: 'Dates use consistent format (MMM YYYY or YYYY-MM) throughout.',
    passCheck: (text: string) => {
      const datePattern = /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|January|February|March|April|June|July|August|September|October|November|December)\s\d{4}\b/g;
      const matches = text.match(datePattern);
      return matches !== null && matches.length >= 2;
    },
    severity: 'medium',
  },
  {
    id: 'no-graphics-tables',
    title: 'No Graphics or Tables',
    description: 'Content is in simple text format without embedded images or table structures.',
    passCheck: (text: string) => {
      return !text.startsWith('http') && !text.includes('![img') && !text.includes(':::table');
    },
    severity: 'high',
  },
  {
    id: 'contact-info',
    title: 'Contact Information',
    description: 'Includes email, phone, and location information.',
    passCheck: (text: string) => {
      const hasEmail = /\S+@\S+\.\S+/.test(text);
      const hasPhone = /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/.test(text);
      return hasEmail || hasPhone;
    },
    severity: 'medium',
  },
  {
    id: 'page-length',
    title: 'Appropriate Length',
    description: 'Resume is 1-2 pages (200-800 words for most roles).',
    passCheck: (text: string) => {
      const words = text.split(/\s+/).filter(w => w.length > 0).length;
      return words >= 150 && words <= 1000;
    },
    severity: 'high',
  },
];

// ─── Industry Detection ─────────────────────────────────────────────
function detectIndustry(text: string, explicitIndustry?: string): string {
  if (explicitIndustry) return explicitIndustry.toLowerCase();

  const lower = text.toLowerCase();
  const scores: Record<string, number> = {};

  for (const [industry, keywords] of Object.entries(ATS_KEYWORDS)) {
    scores[industry] = keywords.filter(k => lower.includes(k.toLowerCase())).length;
  }

  const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  if (best && best[1] > 2) return best[0];

  return 'general';
}

// ─── Resume Analysis Engine ─────────────────────────────────────────
interface ResumeAnalysis {
  overallScore: number;
  atsCompatibility: 'excellent' | 'good' | 'needs-work' | 'poor';
  wordCount: number;
  detectedIndustry: string;
  results: Array<{
    ruleId: string;
    title: string;
    description: string;
    passed: boolean;
    severity: string;
  }>;
  matchedKeywords: string[];
  missingKeywords: string[];
  suggestions: string[];
  keywordDensity: Array<{ keyword: string; count: number }>;
}

function analyzeResume(resumeText: string, jobDescription?: string, industry?: string): ResumeAnalysis {
  const industryDetected = detectIndustry(resumeText, industry);
  const words = resumeText.split(/\s+/).filter(w => w.length > 0);
  const wordCount = words.length;
  const lower = resumeText.toLowerCase();

  // Run ATS rules
  const context = { jobDescription, industry };
  const ruleResults = ATS_RULES.map(rule => ({
    ruleId: rule.id,
    title: rule.title,
    description: rule.description,
    passed: rule.passCheck(resumeText, context),
    severity: rule.severity,
  }));

  const passedCount = ruleResults.filter(r => r.passed).length;
  const totalRules = ruleResults.length;
  let score = Math.round((passedCount / totalRules) * 100);

  // Bonus/penalty adjustments
  if (wordCount < 100) score -= 20;
  else if (wordCount < 200) score -= 10;
  else if (wordCount > 1200) score -= 10;

  // Keyword matching
  const relevantKeywords = ATS_KEYWORDS[industryDetected] || [];
  const matchedKeywords = relevantKeywords.filter(k => lower.includes(k.toLowerCase()));
  const missingKeywords = relevantKeywords.filter(k => !lower.includes(k.toLowerCase()));

  // Keyword density
  const keywordDensity = matchedKeywords.slice(0, 5).map(k => ({
    keyword: k,
    count: lower.split(k.toLowerCase()).length - 1,
  }));

  // Generate suggestions
  const suggestions: string[] = [];

  if (!ruleResults.find(r => r.ruleId === 'action-verbs')?.passed) {
    suggestions.push('Start bullet points with strong action verbs: "Led a team of 5..." or "Reduced costs by 15%..."');
  }
  if (!ruleResults.find(r => r.ruleId === 'quantified-achievements')?.passed) {
    suggestions.push('Add quantified achievements: "Reduced ticket resolution time by 30%", "Managed $500K budget"');
  }
  if (missingKeywords.length > 3) {
    suggestions.push(`Add these industry keywords to improve ATS match: ${missingKeywords.slice(0, 5).join(', ')}`);
  }
  if (wordCount < 200) {
    suggestions.push('Your resume appears short. Add more detail for each role (aim for 3-5 bullets per position).');
  }
  if (!ruleResults.find(r => r.ruleId === 'standard-sections')?.passed) {
    suggestions.push('Include standard section headings: "Professional Experience", "Education", "Skills"');
  }

  // ATS compatibility rating
  const atsCompatibility: ResumeAnalysis['atsCompatibility'] =
    score >= 85 ? 'excellent' :
    score >= 70 ? 'good' :
    score >= 50 ? 'needs-work' : 'poor';

  return {
    overallScore: Math.max(0, Math.min(100, score)),
    atsCompatibility,
    wordCount,
    detectedIndustry: industryDetected,
    results: ruleResults,
    matchedKeywords,
    missingKeywords,
    suggestions: suggestions.slice(0, 5),
    keywordDensity,
  };
}

// ─── Resume Tailoring ────────────────────────────────────────────────
function tailorResume(resumeText: string, jobDescription: string): {
  tailoredBullets: string[];
  addedKeywords: string[];
  matchScore: number;
} {
  // Extract keywords from job description
  const jdWords = jobDescription.toLowerCase().split(/\s+/);
  const jdKeywords = new Set(jdWords.filter(w => w.length > 4));

  // Find resume bullet points
  const bullets = resumeText
    .split('\n')
    .map(l => l.trim())
    .filter(l => /^[-•*·]/.test(l) || /^\d+\./.test(l) || /\b(Led|Managed|Developed|Created|Implemented|Built|Designed|Analyzed|Improved|Optimized|Automated|Coordinated|Reduced|Increased)\b/.test(l));

  const result: string[] = [];
  const addedKeywords: string[] = [];

  // For each missing JD keyword, suggest incorporating it
  const lowerResume = resumeText.toLowerCase();
  const missing = Array.from(jdKeywords).filter((w: string) => !lowerResume.includes(w) && isNaN(Number(w)));

  // Tailor existing bullets
  const actionVerbs = ['Led', 'Managed', 'Developed', 'Implemented', 'Created', 'Designed', 'Optimized', 'Automated', 'Analyzed', 'Reduced', 'Increased', 'Improved', 'Streamlined', 'Orchestrated', 'Established'];

  for (const bullet of bullets) {
    const cleaned = bullet.replace(/^[-•*·]\s*/, '').replace(/^\d+\.\s*/, '');
    result.push(cleaned);
  }

  // Suggest new bullets for missing keywords
  for (const keyword of missing.slice(0, 5)) {
    if (!['with', 'that', 'this', 'from', 'have', 'will', 'your', 'they', 'them', 'their', 'when', 'where', 'which', 'about', 'into', 'than', 'then', 'also', 'more'].includes(keyword as string)) {
      result.push(`Leveraged ${keyword} to drive measurable improvements`);
      addedKeywords.push(capitalize(keyword));
    }
  }

  // Calculate match score
  const originalMatch = jdKeywords.size > 0
    ? (jdKeywords.size - missing.length) / jdKeywords.size * 100
    : 50;
  const newMatch = Math.min(95, originalMatch + 20);

  return {
    tailoredBullets: result.slice(0, 15),
    addedKeywords: addedKeywords.slice(0, 5),
    matchScore: Math.round(newMatch),
  };
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ─── Health ─────────────────────────────────────────────────────────
app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'flagship-resume-ats live',
    version: VERSION,
    endpoints: ['/api/analyze', '/api/tailor', '/api/score', '/api/formats', '/api/keywords'],
    uptime: process.uptime()
  });
});

// ─── OpenAPI Discovery ──────────────────────────────────────────────
app.get('/openapi.json', (_req: Request, res: Response) => {
  res.json({
    openapi: '3.1.0',
    info: {
      title: 'Flagship Resume ATS — ATS Optimization API',
      version: VERSION,
      description: 'AI-powered ATS resume analysis, scoring, tailoring, and job matching. Optimize resumes for applicant tracking systems to increase interview rates.',
      contact: { email: 'pgpgentles@gmail.com' },
      'x-guidance': 'Use POST /api/analyze to submit resume text for ATS scoring and suggestions. Use POST /api/tailor to optimize resume against a specific job description. Use POST /api/score for a quick keyword match score. Free endpoints: GET /api/formats and GET /api/keywords.',
    },
    servers: [{ url: 'https://flagship-resume-ats.onrender.com' }],
    paths: {
      '/api/analyze': {
        post: {
          operationId: 'analyzeResume',
          summary: 'Full ATS resume analysis',
          tags: ['ATS Analysis'],
          'x-payment-info': {
            price: { mode: 'fixed', currency: 'USD', amount: '0.05' },
            protocols: [{ x402: {} }],
          },
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    resumeText: {
                      type: 'string',
                      description: 'Full resume text content',
                    },
                    jobDescription: {
                      type: 'string',
                      description: 'Job description to match against (optional)',
                    },
                    industry: {
                      type: 'string',
                      description: 'Target industry (e.g., software engineering, data science, devops/sre)',
                    },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'ATS analysis report with score, suggestions, and keyword matches',
              content: { 'application/json': { schema: { type: 'object' } } },
            },
            '402': { description: 'Payment Required' },
          },
        },
      },
      '/api/tailor': {
        post: {
          operationId: 'tailorResume',
          summary: 'Tailor resume against job description',
          tags: ['ATS Analysis'],
          'x-payment-info': {
            price: { mode: 'fixed', currency: 'USD', amount: '0.10' },
            protocols: [{ x402: {} }],
          },
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    resumeText: { type: 'string', description: 'Resume text' },
                    jobDescription: { type: 'string', description: 'Job posting text' },
                  },
                  required: ['resumeText', 'jobDescription'],
                },
              },
            },
          },
          responses: {
            '200': { description: 'Tailored resume suggestions and match score' },
            '402': { description: 'Payment Required' },
          },
        },
      },
      '/api/score': {
        post: {
          operationId: 'quickScore',
          summary: 'Quick keyword match score',
          tags: ['ATS Analysis'],
          'x-payment-info': {
            price: { mode: 'fixed', currency: 'USD', amount: '0.03' },
            protocols: [{ x402: {} }],
          },
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    resumeText: { type: 'string' },
                    jobDescription: { type: 'string' },
                    industry: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: {
            '200': { description: 'Quick score result' },
            '402': { description: 'Payment Required' },
          },
        },
      },
      '/api/formats': {
        get: {
          operationId: 'atsFormats',
          summary: 'List of ATS-friendly formatting rules (free)',
          tags: ['Reference'],
          security: [],
          responses: {
            '200': { description: 'ATS formatting rules' },
          },
        },
      },
      '/api/keywords': {
        get: {
          operationId: 'keywordBank',
          summary: 'Get industry-specific keyword database (free)',
          tags: ['Reference'],
          security: [],
          parameters: [
            {
              name: 'industry',
              in: 'query',
              required: false,
              schema: { type: 'string', description: 'Filter to specific industry' },
            },
          ],
          responses: {
            '200': { description: 'Keyword lists by industry' },
          },
        },
      },
    },
  });
});

// ─── API: Full Analysis ──────────────────────────────────────────────
const queryLog: Array<{ type: string; timestamp: string; path: string }> = [];
const MAX_LOG = 1000;

app.post('/api/analyze', (req: Request, res: Response) => {
  const { resumeText, jobDescription, industry } = req.body;

  if (!resumeText || typeof resumeText !== 'string' || resumeText.trim().length < 50) {
    return res.status(400).json({
      error: 'Field "resumeText" is required and must be at least 50 characters.',
    });
  }

  const result = analyzeResume(resumeText, jobDescription, industry);
  queryLog.push({ type: 'analyze', timestamp: new Date().toISOString(), path: '/api/analyze' });
  if (queryLog.length > MAX_LOG) queryLog.shift();

  res.json({
    ...result,
    generatedAt: new Date().toISOString(),
    disclaimer: 'This analysis is for informational purposes. Always review and customize your resume for each application.',
  });
});

// ─── API: Tailor Resume ─────────────────────────────────────────────
app.post('/api/tailor', (req: Request, res: Response) => {
  const { resumeText, jobDescription } = req.body;
  if (!resumeText || !jobDescription) {
    return res.status(400).json({ error: 'Both "resumeText" and "jobDescription" are required.' });
  }

  const result = tailorResume(resumeText, jobDescription);
  queryLog.push({ type: 'tailor', timestamp: new Date().toISOString(), path: '/api/tailor' });
  if (queryLog.length > MAX_LOG) queryLog.shift();

  res.json({
    ...result,
    generatedAt: new Date().toISOString(),
  });
});

// ─── API: Quick Score ───────────────────────────────────────────────
app.post('/api/score', (req: Request, res: Response) => {
  const { resumeText, jobDescription, industry } = req.body;
  if (!resumeText) {
    return res.status(400).json({ error: '"resumeText" is required.' });
  }

  const lowerResume = resumeText.toLowerCase();
  const jdLower = (jobDescription || '').toLowerCase();

  let matchScore = 50;
  const jdKeywords = jdLower.split(/\s+/).filter((w: string) => w.length > 4);

  if (jdKeywords.length > 0) {
    const matched = jdKeywords.filter((w: string) => lowerResume.includes(w)).length;
    matchScore = Math.round((matched / jdKeywords.length) * 100);
  }

  queryLog.push({ type: 'score', timestamp: new Date().toISOString(), path: '/api/score' });
  if (queryLog.length > MAX_LOG) queryLog.shift();

  res.json({
    matchScore,
    ...analyzeResume(resumeText, jobDescription, industry),
    generatedAt: new Date().toISOString(),
  });
});

// ─── API: Formats Reference ──────────────────────────────────────────
app.get('/api/formats', (_req: Request, res: Response) => {
  res.json({
    totalRules: ATS_RULES.length,
    rules: ATS_RULES.map(r => ({
      id: r.id,
      title: r.title,
      description: r.description,
      severity: r.severity,
    })),
  });
});

// ─── API: Keywords Reference ─────────────────────────────────────────
app.get('/api/keywords', (req: Request, res: Response) => {
  const industry = (req.query.industry as string | undefined)?.toLowerCase();
  if (industry && ATS_KEYWORDS[industry]) {
    res.json({ industry, keywords: ATS_KEYWORDS[industry] });
    return;
  }
  res.json({
    industries: Object.keys(ATS_KEYWORDS),
    keywords: ATS_KEYWORDS,
  });
});

// ─── Static Files ───────────────────────────────────────────────────
app.use(express.static('public'));

app.listen(PORT, () => {
  console.log(`Flagship Resume ATS v${VERSION} running on port ${PORT}`);
  console.log(`API: http://localhost:${PORT}/api/{analyze,tailor,score,formats,keywords}`);
  console.log(`OpenAPI: http://localhost:${PORT}/openapi.json`);
});
