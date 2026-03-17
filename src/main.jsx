import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles/index.css'

class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (this.state.error) return <div style={{padding:40,fontFamily:"monospace",color:"#FCA5A5",background:"#08080C",minHeight:"100vh"}}>
      <h1 style={{color:"#FFEA97",marginBottom:16}}>Something went wrong</h1>
      <pre style={{whiteSpace:"pre-wrap",fontSize:13,lineHeight:1.6}}>{this.state.error.message}</pre>
      <pre style={{whiteSpace:"pre-wrap",fontSize:11,opacity:.5,marginTop:12}}>{this.state.error.stack}</pre>
      <button onClick={()=>{localStorage.clear();window.location.reload()}} style={{marginTop:20,padding:"10px 20px",background:"#FFEA97",color:"#432D1C",border:"none",borderRadius:8,cursor:"pointer",fontWeight:700}}>Clear Data & Reload</button>
    </div>;
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <ErrorBoundary><App /></ErrorBoundary>
)
