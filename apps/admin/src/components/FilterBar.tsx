import React from 'react';
import { FilterState } from '../types/index.js';

interface FilterBarProps {
  filters: FilterState;
  onFilterChange: (newFilters: Partial<FilterState>) => void;
  onReset: () => void;
}

export const FilterBar: React.FC<FilterBarProps> = ({ filters, onFilterChange, onReset }) => {
  return (
    <div className="filter-bar">
      <div className="filter-group">
        {/* Hostel Selector */}
        <div className="form-group" style={{ minWidth: '150px' }}>
          <select
            className="filter-select"
            value={filters.hostelId}
            onChange={(e) => onFilterChange({ hostelId: e.target.value })}
            aria-label="Filter by Hostel"
          >
            <option value="ALL">All Hostels</option>
            <option value="HOSTEL-A">Aryabhata Hall (HOSTEL-A)</option>
            <option value="HOSTEL-K">Kalpana Chawla (HOSTEL-K)</option>
          </select>
        </div>

        {/* Floor / Block Selector */}
        <div className="form-group" style={{ minWidth: '130px' }}>
          <select
            className="filter-select"
            value={filters.floor}
            onChange={(e) => onFilterChange({ floor: e.target.value })}
            aria-label="Filter by Floor"
          >
            <option value="ALL">All Floors</option>
            <option value="1">Floor 1</option>
            <option value="2">Floor 2</option>
            <option value="3">Floor 3</option>
          </select>
        </div>

        {/* Status Selector */}
        <div className="form-group" style={{ minWidth: '170px' }}>
          <select
            className="filter-select"
            value={filters.status}
            onChange={(e) => onFilterChange({ status: e.target.value })}
            aria-label="Filter by Status"
          >
            <option value="ALL">All Presence Statuses</option>
            <option value="VERIFIED_INSIDE">🟢 Verified Inside</option>
            <option value="VERIFIED_OUTSIDE">🔵 Verified Outside</option>
            <option value="APPROVED_LEAVE">🟣 Approved Leave</option>
            <option value="PENDING_VERIFICATION">🟡 Pending Verification</option>
            <option value="VERIFICATION_FAILED">🔴 Verification Failed</option>
          </select>
        </div>

        {/* Room Search */}
        <div className="form-group">
          <input
            type="text"
            className="filter-input"
            style={{ width: '120px' }}
            placeholder="Room (e.g. 101)"
            value={filters.roomSearch}
            onChange={(e) => onFilterChange({ roomSearch: e.target.value })}
            aria-label="Filter by Room"
          />
        </div>
      </div>

      <div className="filter-group">
        {/* Student Name / Roll Number Search */}
        <input
          type="text"
          className="filter-input search-input"
          placeholder="🔍 Search student name or roll..."
          value={filters.searchTerm}
          onChange={(e) => onFilterChange({ searchTerm: e.target.value })}
          aria-label="Search students"
        />

        <button className="btn btn-secondary btn-sm" onClick={onReset} title="Reset all filters">
          Reset Filters
        </button>
      </div>
    </div>
  );
};
