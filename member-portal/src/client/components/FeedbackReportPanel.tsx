import { useEffect, useState } from "react";
import { type FeedbackReportEntry, getFeedbackReport } from "../api";
import { formatDate } from "./portalShared";

export function FeedbackReportPanel() {
  const [feedback, setFeedback] = useState<FeedbackReportEntry[]>([]);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  async function refreshFeedback() {
    setError("");
    setIsLoading(true);

    try {
      const result = await getFeedbackReport();
      setFeedback(result.feedback);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load feedback report.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    refreshFeedback();
  }, []);

  return (
    <section className="feedback-report" id="feedback" aria-label="Facilitator feedback report">
      <div className="admin-heading">
        <div>
          <p className="eyebrow">Feedback</p>
          <h2>Facilitator Feedback for Students</h2>
        </div>
        <button type="button" onClick={() => refreshFeedback()} disabled={isLoading}>Refresh</button>
      </div>
      {error ? <p className="admin-status is-error" role="alert">{error}</p> : null}
      {isLoading ? <p className="loading-state">Loading feedback...</p> : null}
      {!isLoading && !feedback.length ? <p className="loading-state">No facilitator feedback yet.</p> : null}
      {feedback.length ? (
        <div className="feedback-table-wrap">
          <table className="feedback-table">
            <thead>
              <tr>
                <th>Student</th>
                <th>Club</th>
                <th>Meeting</th>
                <th>Related Roles</th>
                <th>Score</th>
                <th>Feedback</th>
                <th>Evaluator</th>
              </tr>
            </thead>
            <tbody>
              {feedback.map((entry) => (
                <tr key={entry.id}>
                  <td>{entry.studentName}</td>
                  <td>{entry.clubName}</td>
                  <td>{formatDate(entry.meetingDate)}<span>{entry.meetingTitle}</span></td>
                  <td>{entry.roleName}</td>
                  <td>{entry.score}/100</td>
                  <td>{entry.feedback || "No comment entered."}</td>
                  <td>{entry.evaluatorName}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
