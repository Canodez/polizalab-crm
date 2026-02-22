import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ImagePreview from '../ImagePreview';

describe('ImagePreview', () => {
  const mockOnSave = jest.fn();
  const mockOnCancel = jest.fn();
  const mockImageUrl = 'data:image/jpeg;base64,mockbase64data';
  const mockFileName = 'test-photo.jpg';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders image preview with correct image', () => {
    render(
      <ImagePreview
        imageUrl={mockImageUrl}
        fileName={mockFileName}
        onSave={mockOnSave}
        onCancel={mockOnCancel}
      />
    );

    const image = screen.getByAltText('Vista previa');
    expect(image).toBeInTheDocument();
    expect(image).toHaveAttribute('src', mockImageUrl);
  });

  it('displays file name', () => {
    render(
      <ImagePreview
        imageUrl={mockImageUrl}
        fileName={mockFileName}
        onSave={mockOnSave}
        onCancel={mockOnCancel}
      />
    );

    expect(screen.getByText(mockFileName)).toBeInTheDocument();
  });

  it('calls onSave when save button is clicked', async () => {
    const user = userEvent.setup();
    render(
      <ImagePreview
        imageUrl={mockImageUrl}
        fileName={mockFileName}
        onSave={mockOnSave}
        onCancel={mockOnCancel}
      />
    );

    const saveButton = screen.getByRole('button', { name: /guardar/i });
    await user.click(saveButton);

    expect(mockOnSave).toHaveBeenCalledTimes(1);
  });

  it('calls onCancel when cancel button is clicked', async () => {
    const user = userEvent.setup();
    render(
      <ImagePreview
        imageUrl={mockImageUrl}
        fileName={mockFileName}
        onSave={mockOnSave}
        onCancel={mockOnCancel}
      />
    );

    const cancelButton = screen.getByRole('button', { name: /cancelar/i });
    await user.click(cancelButton);

    expect(mockOnCancel).toHaveBeenCalledTimes(1);
  });

  it('calls onCancel when close button is clicked', async () => {
    const user = userEvent.setup();
    render(
      <ImagePreview
        imageUrl={mockImageUrl}
        fileName={mockFileName}
        onSave={mockOnSave}
        onCancel={mockOnCancel}
      />
    );

    const closeButton = screen.getByRole('button', { name: /cerrar/i });
    await user.click(closeButton);

    expect(mockOnCancel).toHaveBeenCalledTimes(1);
  });

  it('shows loading state when isLoading is true', () => {
    render(
      <ImagePreview
        imageUrl={mockImageUrl}
        fileName={mockFileName}
        onSave={mockOnSave}
        onCancel={mockOnCancel}
        isLoading={true}
      />
    );

    expect(screen.getByText(/guardando/i)).toBeInTheDocument();
  });

  it('disables buttons when isLoading is true', () => {
    render(
      <ImagePreview
        imageUrl={mockImageUrl}
        fileName={mockFileName}
        onSave={mockOnSave}
        onCancel={mockOnCancel}
        isLoading={true}
      />
    );

    const saveButton = screen.getByRole('button', { name: /guardando/i });
    const cancelButton = screen.getByRole('button', { name: /cancelar/i });
    const closeButton = screen.getByRole('button', { name: /cerrar/i });

    expect(saveButton).toBeDisabled();
    expect(cancelButton).toBeDisabled();
    expect(closeButton).toBeDisabled();
  });

  it('displays upload progress bar when uploading', () => {
    render(
      <ImagePreview
        imageUrl={mockImageUrl}
        fileName={mockFileName}
        onSave={mockOnSave}
        onCancel={mockOnCancel}
        isLoading={true}
        uploadProgress={45}
      />
    );

    expect(screen.getByText('Subiendo imagen...')).toBeInTheDocument();
    expect(screen.getByText('45%')).toBeInTheDocument();
  });

  it('displays error message when provided', () => {
    const errorMessage = 'Error al subir la imagen';
    render(
      <ImagePreview
        imageUrl={mockImageUrl}
        fileName={mockFileName}
        onSave={mockOnSave}
        onCancel={mockOnCancel}
        error={errorMessage}
      />
    );

    expect(screen.getByText(errorMessage)).toBeInTheDocument();
  });

  it('allows zooming in', async () => {
    const user = userEvent.setup();
    render(
      <ImagePreview
        imageUrl={mockImageUrl}
        fileName={mockFileName}
        onSave={mockOnSave}
        onCancel={mockOnCancel}
      />
    );

    const zoomInButton = screen.getByRole('button', { name: /acercar/i });
    await user.click(zoomInButton);

    // Check that zoom percentage increased
    expect(screen.getByText(/110%/i)).toBeInTheDocument();
  });

  it('allows zooming out', async () => {
    const user = userEvent.setup();
    render(
      <ImagePreview
        imageUrl={mockImageUrl}
        fileName={mockFileName}
        onSave={mockOnSave}
        onCancel={mockOnCancel}
      />
    );

    const zoomOutButton = screen.getByRole('button', { name: /alejar/i });
    await user.click(zoomOutButton);

    // Check that zoom percentage decreased
    expect(screen.getByText(/90%/i)).toBeInTheDocument();
  });

  it('shows reset zoom button when zoomed', async () => {
    const user = userEvent.setup();
    render(
      <ImagePreview
        imageUrl={mockImageUrl}
        fileName={mockFileName}
        onSave={mockOnSave}
        onCancel={mockOnCancel}
      />
    );

    const zoomInButton = screen.getByRole('button', { name: /acercar/i });
    await user.click(zoomInButton);

    const resetButton = screen.getByRole('button', { name: /restablecer/i });
    expect(resetButton).toBeInTheDocument();
  });

  it('resets zoom when reset button is clicked', async () => {
    const user = userEvent.setup();
    render(
      <ImagePreview
        imageUrl={mockImageUrl}
        fileName={mockFileName}
        onSave={mockOnSave}
        onCancel={mockOnCancel}
      />
    );

    const zoomInButton = screen.getByRole('button', { name: /acercar/i });
    await user.click(zoomInButton);
    await user.click(zoomInButton);

    const resetButton = screen.getByRole('button', { name: /restablecer/i });
    await user.click(resetButton);

    expect(screen.getByText('100%')).toBeInTheDocument();
  });

  it('disables zoom in at maximum zoom (200%)', async () => {
    const user = userEvent.setup();
    render(
      <ImagePreview
        imageUrl={mockImageUrl}
        fileName={mockFileName}
        onSave={mockOnSave}
        onCancel={mockOnCancel}
      />
    );

    const zoomInButton = screen.getByRole('button', { name: /acercar/i });
    
    // Click 10 times to reach max zoom
    for (let i = 0; i < 10; i++) {
      await user.click(zoomInButton);
    }

    expect(zoomInButton).toBeDisabled();
  });

  it('disables zoom out at minimum zoom (50%)', async () => {
    const user = userEvent.setup();
    render(
      <ImagePreview
        imageUrl={mockImageUrl}
        fileName={mockFileName}
        onSave={mockOnSave}
        onCancel={mockOnCancel}
      />
    );

    const zoomOutButton = screen.getByRole('button', { name: /alejar/i });
    
    // Click 6 times to reach min zoom (100% -> 90% -> 80% -> 70% -> 60% -> 50%)
    for (let i = 0; i < 6; i++) {
      await user.click(zoomOutButton);
    }

    expect(zoomOutButton).toBeDisabled();
  });
});
