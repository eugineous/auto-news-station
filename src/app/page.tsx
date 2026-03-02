export default function Home() {
    return (
          <main style={{minHeight: '100vh', background: '#111', color: '#fff', padding: '2rem'}}>
                  <h1>Auto News Station</h1>h1>
                <p>Automated Politics & Tech News - Enterprise Scale</p>p>
                <div style={{marginTop: '2rem'}}>
                        <h2>API Endpoints:</h2>h2>
                        <ul>
                                  <li><a href="/api/news" style={{color: '#60a5fa'}}>/api/news</a>a> - Fetch news</li>li>
                                  <li><a href="/api/automate" style={{color: '#60a5fa'}}>/api/automate</a>a> - Full automation</li>li>
                        </ul>ul>
                </div>div>
                <p style={{marginTop: '2rem', color: '#888'}}>Live URL: auto-news-station.vercel.app</p>p>
          </main>main>
        );
}</h1>
