import { FileText, Upload } from "lucide-react";
import Link from "next/link";

import {
  DRAFT_FIELD_TOTAL,
  draftFieldCount,
  type CvDraft,
} from "@/lib/career/cv/draft";
import type { CandidateCvRow } from "@/lib/career/cv/repository";
import { formatDate } from "@/lib/format";

const CONTENT_TYPE_LABELS: Record<string, string> = {
  "application/pdf": "PDF",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    "Word document",
  "text/plain": "Plain text",
};

function fileSize(bytes: number): string {
  if (bytes < 1_024) return `${bytes} bytes`;
  if (bytes < 1_048_576) return `${Math.round(bytes / 1_024)} KB`;
  return `${(bytes / 1_048_576).toFixed(1)} MB`;
}

/**
 * The CV a candidate has stored, what was read out of it, and what it proposes
 * for the profile form.
 *
 * The distinction this panel has to keep visible is that the document is
 * evidence the owner supplied, and everything read out of it is a *proposal*
 * until they save the form. Nothing here is labelled verified, and nothing
 * reaches match scoring or a public surface before that save.
 */
export function CvPanel({
  cvs,
  draft,
  status,
}: {
  cvs: CandidateCvRow[];
  /** Present only when the current CV could actually be read. */
  draft: CvDraft | null;
  status?: string;
}) {
  const current = cvs.find((cv) => cv.is_current) ?? null;
  const older = cvs.filter((cv) => !cv.is_current);
  const readCount = draft ? draftFieldCount(draft) : 0;

  return (
    <section className="surface surface-pad stack" aria-labelledby="cv-heading">
      <h2 className="section-title" id="cv-heading">
        Your CV
      </h2>
      <p className="text-muted m-0">
        Stored privately against your account. It is never shown on a public
        page, never sent to an employer by SalaryPadi, and you can delete it at
        any time. Uploading one lets SalaryPadi offer to fill in the fields
        below and show which roles name the same skills your CV names.
      </p>

      {status === "read" ? (
        <div className="notice" role="status">
          CV stored and read. Check the proposed fields below, change anything
          that is wrong, then save.
        </div>
      ) : status === "stored-unreadable" ? (
        <div className="notice notice-warning" role="status">
          CV stored, but no text could be read from it. Fill the fields in
          yourself — the file is safe and still attachable to an application.
        </div>
      ) : status === "removed" ? (
        <div className="notice" role="status">
          CV removed.
        </div>
      ) : status === "removed-file-remains" ? (
        <div className="notice notice-warning" role="alert">
          The record was removed but the stored file could not be deleted.
          Contact support so the file is not left behind.
        </div>
      ) : status === "too-large" ? (
        <div className="notice notice-danger" role="alert">
          A CV must be 5MB or smaller.
        </div>
      ) : status === "unsupported" ? (
        <div className="notice notice-danger" role="alert">
          Upload a PDF, a Word .docx, or a plain text file.
        </div>
      ) : status === "invalid" ? (
        <div className="notice notice-danger" role="alert">
          No file was received. Choose a file and try again.
        </div>
      ) : status === "error" ? (
        <div className="notice notice-danger" role="alert">
          The CV could not be stored. Try again.
        </div>
      ) : null}

      {current ? (
        <div className="cv-current stack">
          <div className="split">
            <div className="cluster">
              <FileText aria-hidden="true" size={20} />
              <div>
                <p className="m-0 font-bold">{current.file_name}</p>
                <p className="source-note m-0">
                  {CONTENT_TYPE_LABELS[current.content_type] ?? "Document"} ·{" "}
                  {fileSize(current.byte_size)} · uploaded{" "}
                  {formatDate(current.uploaded_at)}
                </p>
              </div>
            </div>
            <div className="cluster">
              <a
                className="button button-secondary"
                href={`/api/career/cv/download?id=${current.id}`}
              >
                Open
              </a>
              <form action="/api/career/cv/remove" method="post">
                <input type="hidden" name="id" value={current.id} />
                <button className="button button-quiet" type="submit">
                  Delete
                </button>
              </form>
            </div>
          </div>

          {current.parse_state === "unreadable" ? (
            <p className="truth-caution m-0">
              {current.parse_note ??
                "No text could be read from this file, so nothing could be proposed from it."}
            </p>
          ) : draft ? (
            <div className="stack">
              <p className="m-0 text-sm">
                <strong>
                  Read {readCount} of {DRAFT_FIELD_TOTAL} things
                </strong>{" "}
                from this CV. Each one is a suggestion, quoted from your own
                document. Nothing is saved until you save the form.
              </p>
              <dl className="data-list">
                {draft.headline ? (
                  <div>
                    <dt>Headline</dt>
                    <dd>
                      {draft.headline.value}
                      <span className="source-note">
                        {" "}
                        — read from &ldquo;{draft.headline.evidence}&rdquo;
                      </span>
                    </dd>
                  </div>
                ) : null}
                {draft.yearsExperience ? (
                  <div>
                    <dt>Years of experience</dt>
                    <dd>
                      {draft.yearsExperience.value}
                      <span className="source-note">
                        {" "}
                        — read from &ldquo;{draft.yearsExperience.evidence}
                        &rdquo;
                      </span>
                    </dd>
                  </div>
                ) : null}
                {draft.experienceLevel ? (
                  <div>
                    <dt>Experience level</dt>
                    <dd>
                      {draft.experienceLevel.value}
                      <span className="source-note">
                        {" "}
                        — read from &ldquo;{draft.experienceLevel.evidence}
                        &rdquo;
                      </span>
                    </dd>
                  </div>
                ) : null}
                {draft.locationCountry ? (
                  <div>
                    <dt>Country</dt>
                    <dd>
                      {draft.locationCountry.value}
                      <span className="source-note">
                        {" "}
                        — read from &ldquo;{draft.locationCountry.evidence}
                        &rdquo;
                      </span>
                    </dd>
                  </div>
                ) : null}
              </dl>
              {draft.skills.length > 0 ? (
                <div className="stack">
                  <p className="source-note m-0">
                    Skills your CV names ({draft.skills.length}):
                  </p>
                  <ul
                    className="tag-list"
                    aria-label="Skills read from your CV"
                  >
                    {draft.skills.map((skill) => (
                      <li key={skill}>{skill}</li>
                    ))}
                  </ul>
                  <p className="field-help m-0">
                    Only terms SalaryPadi can recognise and that your document
                    literally contains are listed. A skill missing from this
                    list is not a judgement about you.
                  </p>
                </div>
              ) : null}
              <Link className="text-link w-fit" href="/matches">
                See roles that name these skills
              </Link>
            </div>
          ) : null}
        </div>
      ) : null}

      <form
        action="/api/career/cv"
        className="cv-upload"
        encType="multipart/form-data"
        method="post"
      >
        <div className="field">
          <label htmlFor="cv">
            {current ? "Replace your CV" : "Upload your CV"}
          </label>
          <input
            accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
            className="input"
            id="cv"
            name="cv"
            required
            type="file"
          />
          <p className="field-help">
            PDF, Word .docx or plain text, up to 5MB. A scanned CV with no text
            layer can be stored but cannot be read.
          </p>
        </div>
        <button className="button w-fit" type="submit">
          <Upload aria-hidden="true" size={17} />
          {current ? "Replace CV" : "Upload CV"}
        </button>
      </form>

      {older.length > 0 ? (
        <details className="trust-drawer">
          <summary>Earlier versions you have kept ({older.length})</summary>
          <ul className="private-list">
            {older.map((cv) => (
              <li className="private-row" key={cv.id}>
                <div className="stack">
                  <p className="m-0">{cv.file_name}</p>
                  <p className="source-note m-0">
                    uploaded {formatDate(cv.uploaded_at)} ·{" "}
                    {fileSize(cv.byte_size)}
                  </p>
                </div>
                <div className="cluster">
                  <a
                    className="text-link"
                    href={`/api/career/cv/download?id=${cv.id}`}
                  >
                    Open
                  </a>
                  <form action="/api/career/cv/remove" method="post">
                    <input type="hidden" name="id" value={cv.id} />
                    <button className="button button-quiet" type="submit">
                      Delete
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
          <p className="field-help m-0">
            Kept because an application record may point at the version you
            actually sent.
          </p>
        </details>
      ) : null}
    </section>
  );
}
