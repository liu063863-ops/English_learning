import {
  BookOpen,
  ChevronDown,
  ClipboardList,
  FileText,
  Gauge,
  Headphones,
  Languages,
  PanelLeftClose,
  PanelLeftOpen,
  PenLine,
  ScrollText,
  Settings
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import Dashboard from "./components/Dashboard.jsx";
import ErrorBook from "./components/ErrorBook.jsx";
import ExamDetailPage from "./components/ExamDetailPage.jsx";
import ExamListPage from "./components/ExamListPage.jsx";
import LoadingScreen from "./components/LoadingScreen.jsx";
import PracticeModule from "./components/PracticeModule.jsx";
import ReadingPractice from "./components/ReadingPractice.jsx";
import VocabularyReview from "./components/VocabularyReview.jsx";
import WritingPractice from "./components/WritingPractice.jsx";
import ReadingExamPage from "./components/readingExam/ReadingExamPage.jsx";
import { api } from "./api.js";

const navGroups = [
  {
    id: "home",
    label: "首页",
    icon: Gauge,
    path: "/",
    items: []
  },
  {
    id: "examCenter",
    label: "考试中心",
    icon: ScrollText,
    defaultOpen: true,
    items: [
      { id: "exams", label: "真题考试", icon: ScrollText, path: "/exams" },
      { id: "practice", label: "专项训练", icon: ClipboardList, path: "/practice" },
      { id: "readingExam", label: "阅读考试", icon: Headphones, path: "/reading-exam" },
      { id: "writing", label: "翻译写作", icon: PenLine, path: "/writing" }
    ]
  },
  {
    id: "resources",
    label: "学习资源",
    icon: BookOpen,
    defaultOpen: true,
    items: [
      { id: "words", label: "单词本", icon: Languages, path: "/words" },
      { id: "reading", label: "阅读练习", icon: FileText, path: "/reading" },
      { id: "errors", label: "错题本", icon: BookOpen, path: "/errors" }
    ]
  },
  {
    id: "settings",
    label: "设置",
    icon: Settings,
    path: "/settings",
    items: []
  }
];

const routeMap = {
  "/": "dashboard",
  "/practice": "practice",
  "/errors": "errors",
  "/words": "words",
  "/reading": "reading",
  "/reading-exam": "readingExam",
  "/writing": "writing",
  "/settings": "settings"
};

export default function App() {
  const [loading, setLoading] = useState(true);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [routePath, setRoutePath] = useState(window.location.pathname);
  const [openGroups, setOpenGroups] = useState(() => {
    const initial = {};
    navGroups.forEach((group) => {
      initial[group.id] = Boolean(group.defaultOpen);
    });
    return initial;
  });
  const [refreshKey, setRefreshKey] = useState(0);
  const activeTab = routeToTab(routePath);

  const activeGroupId = useMemo(() => {
    return navGroups.find((group) => group.path && routeToTab(group.path) === activeTab)?.id
      || navGroups.find((group) => group.items.some((item) => item.id === activeTab))?.id
      || "home";
  }, [activeTab]);

  const refreshStats = () => setRefreshKey((key) => key + 1);

  useEffect(() => {
    const timer = window.setTimeout(() => setLoading(false), 2000);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const syncRoute = () => setRoutePath(window.location.pathname);
    window.addEventListener("popstate", syncRoute);
    return () => window.removeEventListener("popstate", syncRoute);
  }, []);

  function navigate(path) {
    window.history.pushState({}, "", path);
    setRoutePath(path);
  }

  function toggleGroup(groupId) {
    setOpenGroups((current) => ({ ...current, [groupId]: !current[groupId] }));
  }

  if (loading) {
    return <LoadingScreen />;
  }

  return (
    <div className={sidebarCollapsed ? "app-shell sidebar-collapsed" : "app-shell"}>
      <aside className={sidebarCollapsed ? "sidebar collapsed" : "sidebar"}>
        <div className="sidebar-logo">
          <div className="logo-icon">E</div>
          <div className="logo-text">
            <strong>English Exam Lab</strong>
            <span>鑻辫鐪熼鍦ㄧ嚎鑰冭瘯绯荤粺</span>
          </div>
        </div>
        <GroupedNavigation
          activeTab={activeTab}
          activeGroupId={activeGroupId}
          openGroups={openGroups}
          collapsed={sidebarCollapsed}
          onNavigate={navigate}
          onToggleGroup={toggleGroup}
        />
        <button
          className="sidebar-toggle"
          type="button"
          aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          onClick={() => setSidebarCollapsed((value) => !value)}
        >
          {sidebarCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          <span>{sidebarCollapsed ? "展开" : "折叠"}</span>
        </button>
      </aside>

      <main className="main-content">
        {activeTab === "dashboard" && <Dashboard refreshKey={refreshKey} />}
        {activeTab === "practice" && <PracticeModule onChanged={refreshStats} />}
        {activeTab === "errors" && <ErrorBook onChanged={refreshStats} />}
        {activeTab === "words" && <VocabularyReview onChanged={refreshStats} />}
        {activeTab === "reading" && <ReadingPractice onChanged={refreshStats} />}
        {activeTab === "exams" && routePath.startsWith("/exams/") && <ExamDetailPage examId={routePath.split("/")[2]} />}
        {activeTab === "exams" && !routePath.startsWith("/exams/") && <ExamListPage />}
        {activeTab === "readingExam" && <ReadingExamPage />}
        {activeTab === "writing" && <WritingPractice onChanged={refreshStats} />}
        {activeTab === "settings" && <SettingsPage />}
      </main>

      <MobileTabBar activeTab={activeTab} onNavigate={navigate} />
    </div>
  );
}

function GroupedNavigation({ activeTab, activeGroupId, openGroups, collapsed, onNavigate, onToggleGroup }) {
  return (
    <nav className="nav-groups" aria-label="主导航">
      {navGroups.map((group) => {
        const GroupIcon = group.icon;
        const isCurrentGroup = group.id === activeGroupId;
        const hasChildren = group.items.length > 0;
        const isOpen = openGroups[group.id];

        if (!hasChildren) {
          return (
            <button
              key={group.id}
              className={isCurrentGroup ? "nav-item nav-group-trigger active" : "nav-item nav-group-trigger"}
              onClick={() => onNavigate(group.path)}
              title={group.label}
            >
              <GroupIcon className="nav-icon" size={18} />
              <span className="nav-label">{group.label}</span>
            </button>
          );
        }

        return (
          <section key={group.id} className={isOpen ? "nav-group expanded" : "nav-group"}>
            <button
              className={isCurrentGroup ? "nav-group-title active-parent" : "nav-group-title"}
              onClick={() => {
                if (!collapsed) onToggleGroup(group.id);
              }}
              aria-expanded={isOpen}
              title={group.label}
            >
              <GroupIcon className="nav-icon" size={18} />
              <span className="nav-label">{group.label}</span>
              <ChevronDown size={16} className="nav-group-chevron" />
            </button>

            {isOpen && !collapsed && (
              <div className="nav-sublist">
                {group.items.map((item) => {
                  const ItemIcon = item.icon;
                  return (
                    <button
                      key={item.id}
                      className={activeTab === item.id ? "nav-item nav-subitem active" : "nav-item nav-subitem"}
                      onClick={() => onNavigate(item.path)}
                      title={item.label}
                    >
                      <ItemIcon className="nav-icon" size={16} />
                      <span className="nav-label">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        );
      })}
    </nav>
  );
}
function MobileTabBar({ activeTab, onNavigate }) {
  const mobileItems = [
    { id: "dashboard", label: "首页", icon: Gauge, path: "/" },
    { id: "exams", label: "考试", icon: ScrollText, path: "/exams" },
    { id: "words", label: "单词", icon: Languages, path: "/words" },
    { id: "errors", label: "错题", icon: BookOpen, path: "/errors" }
  ];

  return (
    <nav className="mobile-tab-bar" aria-label="移动端导航">
      {mobileItems.map((item) => {
        const Icon = item.icon;
        return (
          <button
            key={item.id}
            className={activeTab === item.id ? "mobile-tab active" : "mobile-tab"}
            onClick={() => onNavigate(item.path)}
          >
            <Icon size={18} />
            <span>{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
function SettingsPage() {
  const [message, setMessage] = useState("");

  async function exportProgress() {
    try {
      const backup = await api.exportProgress();
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `english-exam-lab-progress-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
      setMessage("学习进度已导出。");
    } catch (error) {
      setMessage(error.message || "导出学习进度失败。");
    }
  }

  async function importProgress(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const backup = JSON.parse(await file.text());
      await api.importProgress(backup);
      setMessage("学习进度已导入，刷新页面后生效。");
    } catch (error) {
      setMessage(error.message || "导入学习进度失败。");
    } finally {
      event.target.value = "";
    }
  }

  return (
    <section className="page-section">
      <header className="page-header">
        <div>
          <h1>设置</h1>
          <p>学习计划、题库导入和本地数据管理入口会集中放在这里。</p>
        </div>
      </header>

      <section className="settings-section">
        <h2 className="settings-title">学习偏好</h2>
        <div className="setting-row">
          <div>
            <strong>每日学习提醒</strong>
            <p>在首页展示今日任务和复习提醒。</p>
          </div>
          <button className="toggle active" type="button" aria-label="每日学习提醒已开启" />
        </div>
        <div className="setting-row">
          <div>
            <strong>自动保存答题进度</strong>
            <p>考试和练习时定期保存当前答案。</p>
          </div>
          <button className="toggle active" type="button" aria-label="自动保存答题进度已开启" />
        </div>
      </section>

      <section className="settings-section">
        <h2 className="settings-title">数据管理</h2>
        <div className="setting-row">
          <div>
            <strong>题库导入</strong>
            <p>管理四六级真题、阅读材料和词库数据的本地导入任务。</p>
          </div>
          <button className="secondary-button" type="button">查看状态</button>
        </div>
        <div className="setting-row">
          <div>
            <strong>本地数据库</strong>
            <p>当前使用 SQLite 保存考试、词库和练习记录。</p>
          </div>
          <span className="exam-chip">english_exam.db</span>
        </div>
        <div className="setting-row">
          <div>
            <strong>学习进度备份</strong>
            <p>导出或导入单词复习、错题、考试记录和本地进度。</p>
          </div>
          <div className="settings-actions">
            <button className="secondary-button" type="button" onClick={exportProgress}>导出进度</button>
            <label className="secondary-button import-button">
              导入进度
              <input type="file" accept="application/json,.json" onChange={importProgress} />
            </label>
          </div>
        </div>
        {message && <div className="feedback correct settings-feedback">{message}</div>}
      </section>

      <section className="settings-section">
        <h2 className="settings-title">界面</h2>
        <div className="setting-row">
          <div>
            <strong>紧凑模式</strong>
            <p>减少卡片间距，适合长时间刷题和复盘。</p>
          </div>
          <button className="toggle" type="button" aria-label="紧凑模式未开启" />
        </div>
      </section>
    </section>
  );
}
function routeToTab(pathname) {
  if (pathname === "/exams" || pathname.startsWith("/exams/")) return "exams";
  return routeMap[pathname] || "dashboard";
}




